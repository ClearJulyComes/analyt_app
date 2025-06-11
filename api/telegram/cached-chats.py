import os
import logging
import json
import asyncio
from quart import Quart, request, jsonify
from collections import defaultdict
from upstash_redis.asyncio import Redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Quart(__name__)
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)


@app.route("/api/cached-chats", methods=["POST"])
async def get_cached_analysis():
    try:
        data = await request.get_json()
        user_id = data.get("user_id")
        chat_ids = data.get("chat_ids")

        cache_keys = []
        for chat_id in chat_ids:
            cache_keys.append(f"tganalysis:{user_id}:{chat_id}")

        cached_data = redis.mget(cache_keys) if cache_keys else []

        results = defaultdict(list)
        for key, data in zip(cache_keys, cached_data):
            if not data:
                continue
                
            chat_id = key.decode().split(':')[2]
            try:
                analysis = json.loads(data)
                results[chat_id].append({
                    **analysis,
                    "is_cached": True
                })
            except json.JSONDecodeError:
                continue
        return jsonify(results)
    except Exception as e:
        logger.exception("Get cache failed")
        return jsonify({"error": str(e)}), 500

@app.route("/api/cached-chats", methods=["DELETE"])
async def delete_cached_analysis():
    try:
        data = await request.get_json()
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        keys = [key async for key in redis.scan_iter(f"tganalysis:{user_id}:*")]
        if keys:
            await redis.delete(*keys)

        return jsonify({"deleted_keys": len(keys)})
    except Exception as e:
        logger.exception("Delete cache failed")
        return jsonify({"error": str(e)}), 500