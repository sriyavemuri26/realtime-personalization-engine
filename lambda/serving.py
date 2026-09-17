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
    last_item = item.get('last_interacted_item', item.get('video_id', 'None'))
    return {
        "last_active": item.get('last_active', 'N/A'),
        "last_interacted_item": last_item,
        "last_interacted_event": item.get('last_interacted_event', 'impression'),
        "last_interacted_category": item.get('last_interacted_category', get_item_category(last_item) or 'None'),
        "total_watch_time_ms": int(item.get('total_watch_time_ms', item.get('play_time_ms', 0))),
        "impressions_count": int(item.get('impressions_count', item.get('tab_impression', 0))),
        "clicks_count": int(item.get('clicks_count', item.get('click', 0))),
        "long_views_count": int(item.get('long_views_count', item.get('long_view', 0))),
        "likes_count": int(item.get('likes_count', item.get('like', 0))),
        "comments_count": int(item.get('comments_count', item.get('comment', 0))),
        "shares_count": int(item.get('shares_count', item.get('share', 0))),
        "hates_count": int(item.get('hates_count', item.get('hate', 0)))
    }

import math
import re

CATEGORIES = [
    "Drama", "Gaming", "Anime", "Movies", "Comedy",
    "Cooking", "Aesthetic", "Singing", "Battle", "Cosplay"
]

def build_candidate_pool():
    """Builds the 30 candidate items mapped across the 10 categories (3 of each)."""
    candidates = []
    for i in range(30):
        category = CATEGORIES[i % 10]
        instance_num = (i // 10) + 1
        candidates.append({
            "id": f"item_{i}.gif",
            "index": i,
            "category": category,
            "title": f"{category} Clip #{instance_num}",
            "gifPath": f"/media/item_{i}.gif",
            "video_path": f"/public/media/item_{i}.gif"
        })
    return candidates

CANDIDATE_POOL = build_candidate_pool()

def get_item_category(item_id):
    """Extract category for an item ID or path (e.g., item_0.gif -> Drama)."""
    if not item_id or item_id == 'None':
        return None
    match = re.search(r'item_(\d+)', str(item_id))
    if match:
        idx = int(match.group(1))
        if 0 <= idx < 30:
            return CATEGORIES[idx % 10]
    return None

def score_and_rank_items(user_profile, candidates=None):
    """
    Scores and ranks the 30 candidate videos using real-time user stats:
    1. Category Affinity / Dislike Penalty:
       - If last event is 'hate' (dislike), heavily penalizes candidate videos from the hated category (-10.0)
         and boosts candidate videos from untried/other categories (+1.5).
       - If positive/neutral event, boosts candidate videos matching the last interacted category (+2.0).
    2. Exploration (UCB1): Adds Upper Confidence Bound bonus based on total_impressions.
    """
    if candidates is None:
        candidates = CANDIDATE_POOL

    last_interacted = user_profile.get('last_interacted_item', 'None')
    last_event = str(user_profile.get('last_interacted_event', '')).lower()
    last_category = user_profile.get('last_interacted_category') or get_item_category(last_interacted)

    impressions_count = int(user_profile.get('impressions_count', 0))
    likes_count = int(user_profile.get('likes_count', 0))
    clicks_count = int(user_profile.get('clicks_count', 0))
    shares_count = int(user_profile.get('shares_count', 0))
    comments_count = int(user_profile.get('comments_count', 0))
    hates_count = int(user_profile.get('hates_count', 0))

    is_hate_event = (last_event == 'hate')
    total_impressions = max(impressions_count, 1)
    c_param = 0.5  # UCB exploration factor

    scored_candidates = []
    for candidate in candidates:
        cand_copy = dict(candidate)
        cand_category = candidate['category']
        
        # 1. Category Affinity / Dislike Penalty
        affinity_score = 0.0
        if last_category:
            if is_hate_event:
                if cand_category == last_category:
                    # Heavily penalize the hated category so it drops to the bottom
                    affinity_score = -10.0 - (2.0 * max(hates_count, 1))
                else:
                    # Boost untried/different categories to immediately recommend alternative content
                    affinity_score = 1.5 + (0.1 * likes_count) + (0.05 * clicks_count)
            else:
                if cand_category == last_category:
                    # Positive category affinity boost
                    affinity_score = 2.0 + (0.2 * likes_count) + (0.1 * clicks_count) + (0.3 * shares_count) + (0.15 * comments_count)
                    if hates_count > 0:
                        affinity_score -= (0.5 * hates_count)
                else:
                    affinity_score = 0.0

        # 2. UCB1 Exploration Bonus
        # Less-seen items get an exploration boost
        n_i = 1 if (last_interacted and candidate['id'] in str(last_interacted)) else 0
        ucb_bonus = c_param * math.sqrt(math.log(total_impressions + 1) / (n_i + 1))

        total_score = round(affinity_score + ucb_bonus, 4)
        cand_copy['score'] = total_score
        cand_copy['affinity_score'] = round(affinity_score, 4)
        cand_copy['ucb_bonus'] = round(ucb_bonus, 4)

        scored_candidates.append(cand_copy)

    # Sort descending by total_score, tie-break by index
    ranked = sorted(scored_candidates, key=lambda x: (-x['score'], x['index']))
    return ranked

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
            user_id = query_params.get('user_id')
            action = query_params.get('action')

            # 3A. List available user_ids for analytics dashboard buttons
            if action == 'list_users':
                res = kuairand_table.scan(ProjectionExpression="user_id")
                users = sorted([item["user_id"] for item in res.get("Items", [])])
                return {
                    "statusCode": 200,
                    "headers": CORS_HEADERS,
                    "body": json.dumps(users)
                }

            # 3B. Fetch full telemetry payload for a specific user
            if user_id:
                # Import KeyConditionExpression helper at top of file: from boto3.dynamodb.conditions import Key
                from boto3.dynamodb.conditions import Key

                res = kuairand_table.query(
                    KeyConditionExpression=Key("user_id").eq(str(user_id))
                )
                items = res.get("Items", [])
                
                if not items:
                    return {
                        "statusCode": 404,
                        "headers": CORS_HEADERS,
                        "body": json.dumps({"error": f"Telemetry for user '{user_id}' not found"})
                    }

                # seed.py writes one aggregated summary row per user (video_id == "AGGREGATED_SUMMARY")
                # containing total_interactions/dominant_category/category_probability_shift/etc.
                # Return it directly instead of re-nesting it under "recent_events".
                aggregated = next((i for i in items if i.get("video_id") == "AGGREGATED_SUMMARY"), items[0])

                return {
                    "statusCode": 200,
                    "headers": CORS_HEADERS,
                    "body": json.dumps(aggregated, cls=DecimalEncoder)
                }

            # 3C. Fallback: Batch Stream Scan for live ingestion pipeline
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

        # 4. Route Single-User Live State Inspection & Live Demo Recommendation (GET /feed)
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
            user_profile = {
                'user_id': user_id,
                'last_interacted_item': 'None',
                'impressions_count': 0,
                'likes_count': 0,
                'clicks_count': 0,
                'shares_count': 0,
                'comments_count': 0,
                'hates_count': 0,
                'total_watch_time_ms': 0
            }

        # Score and rank the 30 candidate items strictly isolated from KuaiRand
        ranked_candidates = score_and_rank_items(user_profile)
        ranked_video_paths = [item["video_path"] for item in ranked_candidates]

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "user_id": user_profile.get('user_id', user_id),
                "events": extract_event_state(user_profile),
                "ranked_videos": ranked_video_paths,
                "recommendations": ranked_candidates
            }, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error executing Lambda handler: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to process request", "details": str(e)})
        }