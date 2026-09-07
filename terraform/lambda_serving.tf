data "archive_file" "serving_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/serving.py"
  output_path = "${path.module}/../lambda/serving.zip"
}

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
resource "aws_dynamodb_table" "kuairand_analytics" {
  name         = "kuairand_analytics"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "video_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "video_id"
    type = "S"
  }
}

resource "aws_iam_role_policy_attachment" "serving_lambda_logs" {
  role       = aws_iam_role.serving_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "serving_lambda_dynamo_policy" {
  name = "serving_lambda_dynamo_policy"
  role = aws_iam_role.serving_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ]
      Resource = [
        "arn:aws:dynamodb:us-east-2:783598594659:table/user_profiles",
        "arn:aws:dynamodb:us-east-2:783598594659:table/kuairand_analytics"
      ]
    }]
  })
}

resource "aws_lambda_function" "serving_lambda" {
  function_name    = "recommendation-serving-lambda"
  role             = aws_iam_role.serving_lambda_role.arn
  handler          = "serving.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.serving_lambda_zip.output_path
  source_code_hash = data.archive_file.serving_lambda_zip.output_base64sha256

  environment {
    variables = {
      USER_PROFILES_TABLE      = aws_dynamodb_table.user_profiles.name
      KUAIRAND_ANALYTICS_TABLE = aws_dynamodb_table.kuairand_analytics.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.serving_lambda_logs,
    aws_iam_role_policy.serving_lambda_dynamo_policy
  ]
}

resource "aws_lambda_permission" "api_gw_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.serving_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}