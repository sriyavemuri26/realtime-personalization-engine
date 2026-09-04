import json
import os
import boto3
import time
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

bucket_name = os.environ.get('DATA_LAKE_BUCKET')
table_name = os.environ.get('USER_PROFILES_TABLE', 'user_profiles')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    records = event.get('Records', [])
    print(f"Processing batch of {len(records)} events...")

    events_to_archive = []

    for record in records:
        try:
            body = json.loads(record['body'])
            user_id = body.get('user_id')
            item_id = body.get('item_id')
            event_type = body.get('event_type', 'impression')
            timestamp = body.get('ingested_at', int(time.time()))
            play_time = int(body.get('play_time_ms', 0))

            if not user_id:
                continue

            # Atomic update in DynamoDB for real-time feature tracking
            table.update_item(
                Key={'user_id': user_id},
                UpdateExpression="""
                    SET last_active = :ts,
                        last_interacted_item = :item
                    ADD total_interactions :inc,
                        total_watch_time_ms :watch,
                        likes_count :like,
                        skips_count :skip,
                        clicks_count :click,
                        shares_count :share,
                        impressions_count :imp
                """,
                ExpressionAttributeValues={
                    ':ts': timestamp,
                    ':item': item_id,
                    ':inc': 1,
                    ':watch': play_time,
                    ':like': 1 if event_type == 'like' else 0,
                    ':skip': 1 if event_type == 'skip' else 0,
                    ':click': 1 if event_type == 'click' else 0,
                    ':share': 1 if event_type == 'share' else 0,
                    ':imp': 1 if event_type == 'impression' else 0
                }
            )

            events_to_archive.append(body)

        except Exception as e:
            print(f"Error processing record {record.get('messageId')}: {str(e)}")
            raise e

    if events_to_archive and bucket_name:
        now = datetime.now(timezone.utc)
        partition_path = f"raw-events/year={now.year}/month={now.strftime('%m')}/day={now.strftime('%d')}"
        # Archive events to S3
        archive_key = f"{partition_path}/batch_{int(time.time())}_{context.aws_request_id}.json"

        s3.put_object(
            Bucket=bucket_name,
            Key=archive_key,
            Body=json.dumps(events_to_archive),
            ContentType='application/json'
        )
        print(f"Archived {len(events_to_archive)} events to S3 at {archive_key}")

    return {"statusCode": 200, "body": "Successfully processed batch"}