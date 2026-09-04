variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket for raw events"
  default     = "personalization-raw-events-bucket"
}