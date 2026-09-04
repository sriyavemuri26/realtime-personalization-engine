resource "aws_s3_bucket" "raw_events" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_events_lifecycle" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    id     = "archive-and-delete-raw-events"
    status = "Enabled"

    filter {
      prefix = "raw-events/"
    }

    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 90
    }
  }
}