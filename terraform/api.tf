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

# Serving Endpoint: GET /feed
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

# Ingestion Endpoint: POST /v1/events
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