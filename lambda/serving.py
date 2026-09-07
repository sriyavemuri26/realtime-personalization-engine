import json
import os
import boto3
from decimal import Decimal

# Initialize DynamoDB resources
dynamodb = boto3.resource('dynamodb')

PROFILES_TABLE_NAME = os.environ.get('USER_PROFILES_TABLE', 'user_profiles')
KUAIRAND_TABLE_NAME = os.environ.get('KUAIRAND_ANALYTICS_TABLE', 'kuairand_analytics')

profiles_table = dynamodb.Table(PROFILES_TABLE_NAME)
kuairand_table = dynamodb.Table(KUAIRAND_TABLE_NAME)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
}

class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to convert DynamoDB Decimal types to native floats/ints."""
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o) if o % 1 != 0 else int(o)
        return super(DecimalEncoder, self).default(o)

def extract_event_state(item):
    """Universal schema builder for all real-time stream interactions (Demo + KuaiRand)."""
    return {
        "last_active": item.get('last_active', 'N/A'),
        "last_interacted_item": item.get('last_interacted_item', item.get('video_id', 'None')),
        "total_watch_time_ms": int(item.get('total_watch_time_ms', item.get('play_time_ms', 0))),
        "impressions_count": int(item.get('impressions_count', item.get('tab_impression', 0))),
        "clicks_count": int(item.get('clicks_count', item.get('click', 0))),
        "long_views_count": int(item.get('long_views_count', item.get('long_view', 0))),
        "likes_count": int(item.get('likes_count', item.get('like', 0))),
        "comments_count": int(item.get('comments_count', item.get('comment', 0))),
        "shares_count": int(item.get('shares_count', item.get('share', 0))),
        "hates_count": int(item.get('hates_count', item.get('hate', 0)))
    }

def lambda_handler(event, context):
    # Determine HTTP Method across both REST API and HTTP API formats
    http_method = event.get('requestContext', {}).get('http', {}).get('method') or event.get('httpMethod', '')
    
    # 1. Handle Preflight OPTIONS Request immediately
    if http_method == 'OPTIONS':
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"message": "CORS preflight successful"})
        }

    path = event.get('path', '') or event.get('requestContext', {}).get('http', {}).get('path', '')
    query_params = event.get('queryStringParameters') or {}

    try:
        # 2. Route POST /v1/events (Event Ingestion handling)
        if http_method == 'POST' or '/v1/events' in path:
            raw_body = event.get('body', '{}')
            payload = json.loads(raw_body) if isinstance(raw_body, str) else raw_body

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "status": "success",
                    "message": "Event processed successfully",
                    "received": payload
                })
            }

        # 3. Route Batch Stream View / Analytics (/analytics or type=kuairand)
        if '/analytics' in path or query_params.get('type') == 'kuairand':
            response = kuairand_table.scan(Limit=50)
            raw_items = response.get('Items', [])
            
            stream_events = [
                {
                    "user_id": item.get('user_id'),
                    "video_id": item.get('video_id', 'vid_unknown'),
                    "events": extract_event_state(item)
                }
                for item in raw_items
            ]
            
            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "stream_source": "live_ingestion_pipeline",
                    "total_records": len(stream_events),
                    "data": stream_events
                }, cls=DecimalEncoder)
            }

        # 4. Route Single-User Live State Inspection (GET /feed)
        user_id = query_params.get('user_id')
        if not user_id:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Missing user_id query parameter"})
            }
        
        response = profiles_table.get_item(Key={'user_id': user_id})
        user_profile = response.get('Item', {})

        if not user_profile:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"message": "User profile not found"})
            }

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "user_id": user_profile.get('user_id'),
                "events": extract_event_state(user_profile)
            }, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error executing Lambda handler: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to process request", "details": str(e)})
        }