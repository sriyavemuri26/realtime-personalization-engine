data "archive_file" "processor_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/processor.py"
  output_path = "${path.module}/../lambda/processor.zip"
}

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

resource "aws_iam_role_policy_attachment" "processor_lambda_logs" {
  role       = aws_iam_role.processor_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

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
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.data_lake.arn}/*"
      }
    ]
  })
}

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
      DATA_LAKE_BUCKET    = aws_s3_bucket.data_lake.id
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.processor_lambda_logs,
    aws_iam_role_policy.processor_lambda_policy
  ]
}

resource "aws_lambda_event_source_mapping" "sqs_processor_trigger" {
  event_source_arn = aws_sqs_queue.ingestion_queue.arn
  function_name    = aws_lambda_function.processor_lambda.arn
  batch_size       = 10
}