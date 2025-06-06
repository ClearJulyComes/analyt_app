from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
from upstash_redis import Redis
import os
import logging
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

app = Flask(__name__)

# Telegram credentials
api_id = int(os.environ.get("TELEGRAM_API_ID"))
api_hash = os.environ.get("TELEGRAM_API_HASH")

# Upstash Redis (HTTP mode)
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)

async def create_session(phone):
    client = None
    try:
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        await client.start(phone=phone)
        return client.session.save()
    finally:
        if client and not client.is_connected():
            await client.disconnect()

@app.route('/api/save-userinfo', methods=['POST'])
def save_userinfo():
    try:
        data = request.get_json()
        logger.info("[Save userinfo] Request: %s", data)
        user_id = data.get("userId")
        phone = data.get("phone")

        if not user_id or not phone:
            return jsonify({"error": "Missing userId or phone"}), 400

        # Run async Telethon session creation
        string_session = asyncio.run(create_session(phone))
        logger.info("[Session] Created: %s", string_session)

        # Save to Redis
        redis.set(f"tg:session:{user_id}", string_session, ex=60 * 60 * 24)
        redis.set(f"tg:phone:{user_id}", phone, ex=60 * 60 * 24)

        return jsonify({"ok": True})
    except Exception as e:
        logger.exception("[Redis] Save error:")
        return jsonify({"error": str(e)}), 500
