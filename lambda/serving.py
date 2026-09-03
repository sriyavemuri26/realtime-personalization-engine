import json
import os
import time
import boto3

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('USER_PROFILES_TABLE', 'user_profiles')
table = dynamodb.Table(TABLE_NAME)

# Dummy item candidate pool (will be replaced by model scoring)
CANDIDATE_ITEMS = [
    {"item_id": "item_101", "title": "Inception", "genre": "Sci-Fi"},
    {"item_id": "item_102", "title": "The Dark Knight", "genre": "Action"},
    {"item_id": "item_103", "title": "Interstellar", "genre": "Sci-Fi"},
    {"item_id": "item_104", "title": "Pulp Fiction", "genre": "Drama"},
    {"item_id": "item_105", "title": "Matrix", "genre": "Sci-Fi"}
]

def lambda_handler(event, context):
    start_time = time.time()
    
    # Extract user_id from query string parameters
    query_params = event.get('queryStringParameters') or {}
    user_id = query_params.get('user_id', 'default_user')
    
    # 1. Fetch user profile from DynamoDB
    try:
        response = table.get_item(Key={'user_id': user_id})
        user_profile = response.get('Item', {})
    except Exception as e:
        print(f"Error fetching profile: {e}")
        user_profile = {}

    # 2. Score & Rank Candidates (Dummy logic for initial working checkpoint)
    # Priority given to genre affinity if present in DynamoDB vector
    affinity = user_profile.get('category_affinity', {})
    top_genre = max(affinity, key=affinity.get) if affinity else None

    ranked_items = sorted(
        CANDIDATE_ITEMS,
        key=lambda x: 1 if x['genre'] == top_genre else 0,
        reverse=True
    )

    execution_time_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({
            "user_id": user_id,
            "latency_ms": execution_time_ms,
            "recommendations": ranked_items
        })
    }
