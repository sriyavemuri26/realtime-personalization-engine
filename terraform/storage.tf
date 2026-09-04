
# S3 Data Lake
resource "aws_s3_bucket" "data_lake" {
  	bucket_prefix = "personalization-data-lake-"
  	force_destroy = true
}

# DynamoDB User Profiles
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
