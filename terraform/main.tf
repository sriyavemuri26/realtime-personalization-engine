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
