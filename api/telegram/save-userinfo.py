from telethon.sync import TelegramClient
from telethon.sessions import StringSession
import redis
import os
import json

# Configure Telegram API credentials
api_id = int(os.environ.get("TELEGRAM_API_ID"))
api_hash = os.environ.get("TELEGRAM_API_HASH")

# Configure Redis client
redis_client = redis.Redis.from_url(os.environ.get("UPSTASH_REDIS_REST_URL"))  # <-- use redis:// or rediss://

def handler(request, response):
    if request.method != "POST":
        response.status_code = 405
        return response.send(json.dumps({"error": "Method not allowed"}))

    try:
        body = request.json()
        user_id = body.get("userId")
        phone = body.get("phone")

        if not user_id or not phone:
            response.status_code = 400
            return response.send(json.dumps({"error": "Missing userId or phone"}))

        with TelegramClient(StringSession(), api_id, api_hash) as client:
            client.start(phone=phone)
            string_session = client.session.save()

            redis_client.setex(f"tg:session:{user_id}", 60 * 60 * 24, string_session)
            redis_client.setex(f"tg:phone:{user_id}", 60 * 60 * 24, phone)

        return response.send(json.dumps({"ok": True}))

    except Exception as e:
        response.status_code = 500
        return response.send(json.dumps({"error": str(e)}))
