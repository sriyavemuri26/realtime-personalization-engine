terraform {
  	required_providers {
    		aws = {
      			source  = "hashicorp/aws"
      			version = "~> 5.0"
    		}
  	}
}

provider "aws" {
  	region = "us-east-2"
}

# S3 Data Lake
resource "aws_s3_bucket" "data_lake" {
  	bucket_prefix = "personalization-data-lake-"
  	force_destroy = true
}

# DynamoDB
resource "aws_dynamodb_table" "user_profiles" {
  	name         = "user_profiles"
  	billing_mode = "PAY_PER_REQUEST"
  	hash_key     = "user_id"

  	attribute {
    		name = "user_id"
    		type = "S"
  	}
}

# SQS Ingestion Queue
resource "aws_sqs_queue" "ingestion_queue" {
  	name                       = "user-interactions-queue"
  	message_retention_seconds  = 86400
  	visibility_timeout_seconds = 30
}

output "s3_bucket_name" {
  	value = aws_s3_bucket.data_lake.id
}

output "dynamodb_table_name" {
  	value = aws_dynamodb_table.user_profiles.name
}

output "sqs_queue_url" {
  	value = aws_sqs_queue.ingestion_queue.id
}

# Package the Python script into a zip artifact
data "archive_file" "serving_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/serving.py"
  output_path = "${path.module}/../lambda/serving.zip"
}

# IAM Role for Serving Lambda
resource "aws_iam_role" "serving_lambda_role" {
  name = "serving_lambda_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Grant DynamoDB Read Permissions
resource "aws_iam_role_policy" "serving_lambda_dynamo_policy" {
  name = "serving_lambda_dynamo_policy"
  role = aws_iam_role.serving_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = aws_dynamodb_table.user_profiles.arn
    }]
  })
}

# Serving Lambda Function
resource "aws_lambda_function" "serving_lambda" {
  function_name = "recommendation-serving-lambda"
  role          = aws_iam_role.serving_lambda_role.arn
  handler       = "serving.lambda_handler"
  runtime       = "python3.11"
  filename      = "./../lambda/serving.zip"

  environment {
    variables = {
      USER_PROFILES_TABLE = aws_dynamodb_table.user_profiles.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.serving_lambda_logs,
    aws_iam_role_policy.serving_lambda_dynamo_policy
  ]
}

# HTTP API Gateway (v2)
resource "aws_apigatewayv2_api" "http_api" {
  name          = "recommendation-engine-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

# API Gateway Integration with Lambda
resource "aws_apigatewayv2_integration" "serving_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.serving_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "feed_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /feed"
  target    = "integrations/${aws_apigatewayv2_integration.serving_integration.id}"
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "api_gw_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.serving_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Output the Live API Endpoint URL
output "api_endpoint" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/feed"
}

# Package Ingestion Lambda
data "archive_file" "ingest_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/ingest.py"
  output_path = "${path.module}/../lambda/ingest.zip"
}

# IAM Role for Ingestion Lambda
resource "aws_iam_role" "ingest_lambda_role" {
  name = "ingest_lambda_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# SQS Write Permissions for Ingestion Lambda
resource "aws_iam_role_policy" "ingest_lambda_sqs_policy" {
  name = "ingest_lambda_sqs_policy"
  role = aws_iam_role.ingest_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.ingestion_queue.arn
    }]
  })
}

# Ingestion Lambda Function
resource "aws_lambda_function" "ingest_lambda" {
  filename         = data.archive_file.ingest_lambda_zip.output_path
  function_name    = "recommendation-ingest-lambda"
  role             = aws_iam_role.ingest_lambda_role.arn
  handler          = "ingest.lambda_handler"
  runtime          = "python3.11"
  source_code_hash = data.archive_file.ingest_lambda_zip.output_base64sha256

  environment {
    variables = {
      SQS_QUEUE_URL = aws_sqs_queue.ingestion_queue.id
    }
  }
}

# API Gateway Route: POST /v1/events
resource "aws_apigatewayv2_integration" "ingest_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ingest_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "events_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /v1/events"
  target    = "integrations/${aws_apigatewayv2_integration.ingest_integration.id}"
}

resource "aws_lambda_permission" "ingest_api_gw_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayIngest"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

output "events_endpoint" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/v1/events"
}

# CloudWatch logging permissions for Serving Lambda
resource "aws_iam_role_policy_attachment" "serving_lambda_logs" {
  role       = aws_iam_role.serving_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CloudWatch logging permissions for Ingest Lambda
resource "aws_iam_role_policy_attachment" "ingest_lambda_logs" {
  role       = aws_iam_role.ingest_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM Role for Feature Processor Lambda
resource "aws_iam_role" "processor_lambda_role" {
  name = "processor_lambda_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Attach basic execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "processor_lambda_logs" {
  role       = aws_iam_role.processor_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB & SQS Access Policy for Processor Lambda
resource "aws_iam_role_policy" "processor_lambda_policy" {
  name = "processor_lambda_policy"
  role = aws_iam_role.processor_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.user_profiles.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.ingestion_queue.arn
      }
    ]
  })
}

# Zip package for Processor Lambda
data "archive_file" "processor_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/processor.py"
  output_path = "${path.module}/../lambda/processor.zip"
}

# Feature Processor Lambda Resource
resource "aws_lambda_function" "processor_lambda" {
  function_name    = "realtime-feature-processor"
  role             = aws_iam_role.processor_lambda_role.arn
  handler          = "processor.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.processor_zip.output_path
  source_code_hash = data.archive_file.processor_zip.output_base64sha256

  environment {
    variables = {
      USER_PROFILES_TABLE = aws_dynamodb_table.user_profiles.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.processor_lambda_logs,
    aws_iam_role_policy.processor_lambda_policy
  ]
}

# Connect SQS as an Event Source Trigger for the Lambda
resource "aws_lambda_event_source_mapping" "sqs_processor_trigger" {
  event_source_arn = aws_sqs_queue.ingestion_queue.arn
  function_name    = aws_lambda_function.processor_lambda.arn
  batch_size       = 10
}