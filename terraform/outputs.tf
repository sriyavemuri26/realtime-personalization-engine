output "s3_bucket_name" {
  value = aws_s3_bucket.data_lake.id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.user_profiles.name
}

output "sqs_queue_url" {
  value = aws_sqs_queue.ingestion_queue.id
}

output "api_endpoint" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/feed"
}

output "events_endpoint" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/v1/events"
}