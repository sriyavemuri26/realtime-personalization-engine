import json
import os
import boto3
import time

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('USER_PROFILES_TABLE', 'user_profiles')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    records = event.get('Records', [])
    print(f"Processing batch of {len(records)} events...")

    for record in records:
        try:
            body = json.loads(record['body'])
            user_id = body.get('user_id')
            item_id = body.get('item_id')
            event_type = body.get('event_type', 'view')
            timestamp = body.get('ingested_at', int(time.time()))

            if not user_id:
                continue

            # Atomic update in DynamoDB for real-time feature tracking
            table.update_item(
                Key={'user_id': user_id},
                UpdateExpression="""
                    SET last_active = :ts,
                        last_interacted_item = :item
                    ADD interaction_count :inc
                """,
                ExpressionAttributeValues={
                    ':ts': timestamp,
                    ':item': item_id,
                    ':inc': 1
                }
            )
            print(f"Updated profile for user: {user_id}")

        except Exception as e:
            print(f"Error processing record {record.get('messageId')}: {str(e)}")
            raise e

    return {"statusCode": 200, "body": "Successfully processed batch"}