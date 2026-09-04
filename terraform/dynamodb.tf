resource "aws_dynamodb_table" "user_features" {
  name         = "user-features"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Environment = "dev"
    Engine      = "realtime-personalization"
  }
}