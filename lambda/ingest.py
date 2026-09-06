import json
import os
import time
import boto3

sqs = boto3.client('sqs')
QUEUE_URL = os.environ.get('SQS_QUEUE_URL')

REQUIRED_FIELDS = {'user_id', 'item_id', 'event_type'}
VALID_EVENTS = {'like', 'hate', 'click', 'impression', 'share', 'long_view', 'comment'}

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}'))
    except Exception:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON payload"})
        }

    # Payload validation
    if not REQUIRED_FIELDS.issubset(body.keys()):
        return {
            "statusCode": 422,
            "body": json.dumps({"error": f"Missing required fields: {REQUIRED_FIELDS - set(body.keys())}"})
        }

    if body['event_type'] not in VALID_EVENTS:
        return {
            "statusCode": 422,
            "body": json.dumps({"error": f"Invalid event_type. Must be one of {VALID_EVENTS}"})
        }

    # Inject server-side timestamp
    body['ingested_at'] = int(time.time())

    # Push to SQS to decouple API response from downstream processing
    try:
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(body)
        )
    except Exception as e:
        print(f"SQS Publish Error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to queue interaction event"})
        }

    return {
        "statusCode": 202,
        "body": json.dumps({"status": "accepted", "event_id": body.get('item_id')})
    }