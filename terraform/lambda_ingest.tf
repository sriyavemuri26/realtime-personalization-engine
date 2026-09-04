data "archive_file" "ingest_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/ingest.py"
  output_path = "${path.module}/../lambda/ingest.zip"
}

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

resource "aws_iam_role_policy_attachment" "ingest_lambda_logs" {
  role       = aws_iam_role.ingest_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

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

resource "aws_lambda_permission" "ingest_api_gw_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayIngest"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}