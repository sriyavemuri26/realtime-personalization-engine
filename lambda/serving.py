import json
import os
import time
import boto3

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('USER_PROFILES_TABLE', 'user_profiles')
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    query_params = event.get('queryStringParameters') or {}
    user_id = query_params.get('user_id')

    if not user_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing user_id query parameter"})
        }
    
    try:
        response = table.get_item(Key={'user_id': user_id})
        user_profile = response.get('Item', {})

        if not user_profile:
            return {
                "statusCode": 404,
                "body": json.dumps({"message": "User profile not found"})
            }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "user_id": user_profile.get('user_id'),
                "features": {
                    "last_active": user_profile.get('last_active'),
                    "last_interacted_item": user_profile.get('last_interacted_item'),
                    "total_watch_time_ms": int(user_profile.get('total_watch_time_ms', 0)),
                    "impressions_count": int(user_profile.get('impressions_count', 0)),
                    "clicks_count": int(user_profile.get('clicks_count', 0)),
                    "long_views_count": int(user_profile.get('long_views_count', 0)),
                    "likes_count": int(user_profile.get('likes_count', 0)),
                    "comments_count": int(user_profile.get('comments_count', 0)),
                    "shares_count": int(user_profile.get('shares_count', 0)),
                    "hates_count": int(user_profile.get('hates_count', 0))
                }
            })
        }
    
    except Exception as e:
        print(f"Error fetching profile: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to retrieve user profile"})
        }
