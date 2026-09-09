import os
import sys
import json

# Add lambda path to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'lambda')))

import serving

def test_candidate_pool():
    print("--- 1. Testing Candidate Pool & Categories Mapping ---")
    candidates = serving.CANDIDATE_POOL
    assert len(candidates) == 30, f"Expected 30 candidates, got {len(candidates)}"
    
    expected_categories = [
        "Drama", "Gaming", "Anime", "Movies", "Comedy",
        "Cooking", "Aesthetic", "Singing", "Battle", "Cosplay"
    ]
    assert serving.CATEGORIES == expected_categories

    # Check 0, 10, 20 are Drama
    assert candidates[0]["category"] == "Drama"
    assert candidates[10]["category"] == "Drama"
    assert candidates[20]["category"] == "Drama"

    # Check 2, 12, 22 are Anime
    assert candidates[2]["category"] == "Anime"
    assert candidates[12]["category"] == "Anime"
    assert candidates[22]["category"] == "Anime"

    # Check 9, 19, 29 are Cosplay
    assert candidates[9]["category"] == "Cosplay"
    assert candidates[19]["category"] == "Cosplay"
    assert candidates[29]["category"] == "Cosplay"

    # Verify all video paths
    for i, c in enumerate(candidates):
        assert c["video_path"] == f"/public/media/item_{i}.gif"
        assert c["gifPath"] == f"/media/item_{i}.gif"
        assert c["id"] == f"item_{i}.gif"

    print("Candidate pool and category mapping passed successfully!")

def test_category_affinity_and_ucb_ranking():
    print("\n--- 2. Testing Category Affinity & UCB1 Scoring ---")
    
    # Scenario A: Cold Start User (No interactions yet)
    cold_user = {
        "user_id": "usr_000099",
        "last_interacted_item": "None",
        "impressions_count": 0,
        "likes_count": 0,
        "clicks_count": 0
    }
    cold_ranked = serving.score_and_rank_items(cold_user)
    assert len(cold_ranked) == 30
    print(f"Cold-start top recommended: {cold_ranked[0]['id']} ({cold_ranked[0]['category']}) with score {cold_ranked[0]['score']}")
    
    # Scenario B: User interacts with a Drama item (e.g. item_0.gif)
    drama_user = {
        "user_id": "usr_000007",
        "last_interacted_item": "item_0.gif",
        "impressions_count": 5,
        "likes_count": 2,
        "clicks_count": 3,
        "shares_count": 1,
        "comments_count": 0,
        "hates_count": 0
    }
    drama_ranked = serving.score_and_rank_items(drama_user)
    top_3_categories = [c["category"] for c in drama_ranked[:3]]
    top_3_ids = [c["id"] for c in drama_ranked[:3]]
    print(f"After interacting with Drama item (item_0.gif):")
    print(f"Top 3 categories: {top_3_categories}")
    print(f"Top 3 IDs: {top_3_ids}")
    
    # The top items must all be Drama (item_10.gif, item_20.gif, item_0.gif)
    assert all(cat == "Drama" for cat in top_3_categories), f"Expected Drama items at the top, got {top_3_categories}"
    assert set(top_3_ids) == {"item_0.gif", "item_10.gif", "item_20.gif"}
    
    # Scenario C: User interacts with Anime item (item_12.gif)
    anime_user = {
        "user_id": "usr_000008",
        "last_interacted_item": "item_12.gif",
        "impressions_count": 10,
        "likes_count": 5,
        "clicks_count": 2,
        "shares_count": 0,
        "comments_count": 1,
        "hates_count": 0
    }
    anime_ranked = serving.score_and_rank_items(anime_user)
    top_anime_cats = [c["category"] for c in anime_ranked[:3]]
    top_anime_ids = [c["id"] for c in anime_ranked[:3]]
    print(f"\nAfter interacting with Anime item (item_12.gif):")
    print(f"Top 3 categories: {top_anime_cats}")
    print(f"Top 3 IDs: {top_anime_ids}")
    assert all(cat == "Anime" for cat in top_anime_cats), f"Expected Anime items at the top, got {top_anime_cats}"
    assert set(top_anime_ids) == {"item_2.gif", "item_12.gif", "item_22.gif"}

    print("Category affinity and UCB1 ranking verified successfully!")

def test_hate_dislike_penalty():
    print("\n--- 4. Testing Dislike/Hate Penalty & Diverse Category Surfacing ---")
    # Scenario: User dislikes/hates Drama video (item_0.gif)
    hated_user = {
        "user_id": "usr_000009",
        "last_interacted_item": "item_0.gif",
        "last_interacted_event": "hate",
        "last_interacted_category": "Drama",
        "impressions_count": 6,
        "likes_count": 1,
        "clicks_count": 1,
        "shares_count": 0,
        "comments_count": 0,
        "hates_count": 1
    }
    hated_ranked = serving.score_and_rank_items(hated_user)
    
    # Verify #1 recommended video is NOT Drama
    top_rec = hated_ranked[0]
    print(f"Top recommendation after HATE on Drama (item_0.gif): {top_rec['id']} ({top_rec['category']}) with score {top_rec['score']}")
    assert top_rec["category"] != "Drama", f"Expected non-Drama category at top after hate event, got {top_rec['category']}"
    
    # Verify all Drama items (0, 10, 20) are penalized to the bottom (negative affinity)
    drama_scores = [c["score"] for c in hated_ranked if c["category"] == "Drama"]
    non_drama_scores = [c["score"] for c in hated_ranked if c["category"] != "Drama"]
    print(f"Non-Drama scores (min/max): {min(non_drama_scores)} / {max(non_drama_scores)}")
    print(f"Drama scores: {drama_scores}")
    
    assert all(ds < min(non_drama_scores) for ds in drama_scores), "All Drama items must score strictly lower than non-Drama items"
    print("Dislike/Hate penalty and alternative category promotion verified successfully!")

def test_lambda_feed_endpoint():
    print("\n--- 5. Testing GET /feed Lambda Handler Response Structure ---")
    mock_event = {
        "httpMethod": "GET",
        "path": "/feed",
        "queryStringParameters": {
            "user_id": "usr_000007"
        }
    }
    
    # Monkey-patch get_item for isolated lambda test without live AWS call
    class MockTable:
        def get_item(self, Key):
            return {
                "Item": {
                    "user_id": Key["user_id"],
                    "last_interacted_item": "item_20.gif", # Drama
                    "last_interacted_event": "like",
                    "last_interacted_category": "Drama",
                    "impressions_count": 4,
                    "likes_count": 3,
                    "clicks_count": 1,
                    "comments_count": 0,
                    "shares_count": 1,
                    "hates_count": 0,
                    "total_watch_time_ms": 12000
                }
            }
    
    serving.profiles_table = MockTable()
    
    response = serving.lambda_handler(mock_event, None)
    assert response["statusCode"] == 200, f"Expected 200, got {response['statusCode']}"
    
    body = json.loads(response["body"])
    assert "ranked_videos" in body
    assert "recommendations" in body
    assert len(body["ranked_videos"]) == 30
    assert len(body["recommendations"]) == 30
    assert body["ranked_videos"][0].startswith("/public/media/item_")
    
    # Since last_interacted_item was item_20.gif (Drama) and event was like, top recommendation should be Drama
    top_rec = body["recommendations"][0]
    print(f"Lambda /feed returned top recommendation: {top_rec['id']} - {top_rec['title']} (Score: {top_rec['score']})")
    assert top_rec["category"] == "Drama"

    print("Lambda /feed endpoint integration test passed successfully!")

if __name__ == "__main__":
    test_candidate_pool()
    test_category_affinity_and_ucb_ranking()
    test_hate_dislike_penalty()
    test_lambda_feed_endpoint()
    print("\n>>> ALL LIVE DEMO PIPELINE TESTS PASSED! <<<")

