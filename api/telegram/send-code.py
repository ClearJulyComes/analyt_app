from flask import Flask, request, jsonify
from telethon.sessions import StringSession
from telethon.sync import TelegramClient
from telethon.errors import SessionPasswordNeededError
import os
from upstash_redis import Redis
import asyncio

app = Flask(__name__)
api_id = int(os.environ["TELEGRAM_API_ID"])
api_hash = os.environ["TELEGRAM_API_HASH"]
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)

async def create_session(phone):
    async with TelegramClient(StringSession(), api_id, api_hash) as client:
        await client.connect()
        if not client.is_user_authorized():
            sent = await client.send_code_request(phone)
            # Store phone_code_hash for later use in /verify-code
            redis.set(f"tg:code_hash:{phone}", sent.phone_code_hash, 300)

@app.route("/api/send-code", methods=["POST"])
def send_code():
    try:
        data = request.get_json()
        phone = data.get("phone")
        if not phone:
            return jsonify({"error": "Missing phone"}), 400

        asyncio.run(create_session(phone))

        return jsonify({"ok": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
