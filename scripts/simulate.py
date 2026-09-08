import os
import time
import random
import json
import requests
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Configuration
BASE_URL = "https://h0pe9irg1f.execute-api.us-east-2.amazonaws.com"
API_EVENTS_URL = f"{BASE_URL}/v1/events"
FEED_URL = f"{BASE_URL}/feed"
AWS_REGION = "us-east-2"
TABLE_NAME = "kuairand_analytics"

EVENT_TYPES = ["impression", "click", "long_view", "like", "comment", "share", "hate"]

# Initialize DynamoDB resource
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)

def generate_sample_event():
    """Generates a synthetic event matching the exact POST /v1/events validation schema."""
    user_id = f"usr_{random.randint(1, 20):06d}"
    item_id = f"item_{random.randint(0, 9)}.gif"
    event_type = random.choice(EVENT_TYPES)
    
    return {
        # DynamoDB batch record fields
        "user_id": user_id,
        "video_id": item_id,
        "item_id": item_id,  # Required by API Gateway / FastAPI schema
        "event_type": event_type,
        "timestamp": int(time.time()),
        "watch_time_ms": random.randint(1000, 15000),
        "impressions_count": 1,
        "clicks_count": 1 if event_type == "click" else 0,
        "long_views_count": 1 if event_type == "long_view" else 0,
        "likes_count": 1 if event_type == "like" else 0,
        "comments_count": 1 if event_type == "comment" else 0,
        "shares_count": 1 if event_type == "share" else 0,
        "hates_count": 1 if event_type == "hate" else 0,
        "total_watch_time_ms": random.randint(1000, 15000)
    }

def test_cors_preflight():
    """Validates CORS options headers across API endpoints."""
    print("=== 1. TESTING CORS PREFLIGHTS ===")
    endpoints = [("/v1/events", "POST"), ("/feed", "GET")]
    
    for path, method in endpoints:
        url = f"{BASE_URL}{path}"
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type"
        }
        try:
            res = requests.options(url, headers=headers, timeout=5)
            status_ok = res.status_code in [200, 204]
            cors_headers = [k for k in res.headers if "access-control" in k.lower()]
            print(f"[{method} {path}] Status: {res.status_code} | CORS Headers Present: {bool(cors_headers)}")
        except Exception as e:
            print(f"[{method} {path}] Preflight Failed: {e}")

def run_simulation_and_verification(num_events=10):
    """Executes live event ingestion, DynamoDB analytics population, and verifies /feed state."""
    print(f"\n=== 2. RUNNING KUAIRAND SIMULATION ({num_events} Events) ===")
    target_user = None

    for i in range(1, num_events + 1):
        event = generate_sample_event()
        target_user = event["user_id"]
        
        # 1. Write record directly to kuairand_analytics DynamoDB table
        try:
            table.put_item(Item=event)
            db_status = "DynamoDB: OK"
        except (BotoCoreError, ClientError) as e:
            db_status = f"DynamoDB Error: {e}"

        # 2. Post to /v1/events API for live user profile aggregation
        try:
            resp = requests.post(API_EVENTS_URL, json=event, timeout=5)
            api_status = f"API: {resp.status_code}"
        except requests.RequestException as e:
            api_status = f"API Error: {e}"

        print(f"[{i}/{num_events}] User: {event['user_id']} | Item: {event['video_id']} | Type: {event['event_type']} | {db_status} | {api_status}")
        time.sleep(0.05)

    # 3. Verify user features endpoint
    print("\n=== 3. VERIFYING FEATURE STORE READ (/feed) ===")
    if target_user:
        try:
            feed_res = requests.get(FEED_URL, params={"user_id": target_user}, timeout=5)
            print(f"GET /feed status for {target_user}: {feed_res.status_code}")
            if feed_res.status_code == 200:
                print(json.dumps(feed_res.json(), indent=2))
            else:
                print(f"Response: {feed_res.text}")
        except Exception as e:
            print(f"Feature store lookup failed: {e}")

if __name__ == "__main__":
    test_cors_preflight()
    run_simulation_and_verification(10)