import csv
import json
import os
import time
import requests

API_ENDPOINT = os.getenv("EVENTS_ENDPOINT", "YOUR_API_GATEWAY_EVENTS_ENDPOINT")
CSV_FILE_PATH = "data/KuaiRand-Pure/data/log_standard_4_22_to_5_08_pure.csv"

def determine_event_type(row):
    """Cascade mapping KuaiRand binary flags to engine events."""
    if int(row.get("is_hate", 0)) == 1:
        return "hate"
    if int(row.get("is_forward", 0)) == 1:
        return "share"
    if int(row.get("is_comment", 0)) == 1:
        return "comment"
    if int(row.get("is_like", 0)) == 1:
        return "like"
    if int(row.get("long_view", 0)) == 1:
        return "long_view"
    if int(row.get("is_click", 0)) == 1:
        return "click"
    
    return "impression"

def stream_kuairand_events(csv_path, max_events=50, delay_sec=0.05):
    if not os.path.exists(csv_path):
        print(f"Error: Could not find CSV file at {csv_path}")
        return

    print(f"Streaming events to endpoint: {API_ENDPOINT}\n")

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        
        for i, row in enumerate(reader):
            if i >= max_events:
                break

            payload = {
                "user_id": f"usr_{row['user_id']}",
                "item_id": f"vid_{row['video_id']}",
                "event_type": determine_event_type(row),
                "play_time_ms": int(row.get("play_time_ms", 0)),
                "duration_ms": int(row.get("duration_ms", 0)),
                "ingested_at": int(time.time())
            }

            try:
                res = requests.post(
                    API_ENDPOINT,
                    headers={"Content-Type": "application/json"},
                    data=json.dumps(payload),
                    timeout=5
                )
                print(f"[{i+1}/{max_events}] User: {payload['user_id']} | Item: {payload['item_id']} | Type: {payload['event_type']} | Status: {res.status_code}")
            except Exception as e:
                print(f"Failed to send event {i+1}: {e}")

            time.sleep(delay_sec)

if __name__ == "__main__":
    stream_kuairand_events(CSV_FILE_PATH, max_events=50, delay_sec=0.05)