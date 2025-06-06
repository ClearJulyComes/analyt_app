from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError
import os
from upstash_redis.asyncio import Redis
import logging
import asyncio
import base64

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

api_id = int(os.environ["TELEGRAM_API_ID"])
api_hash = os.environ["TELEGRAM_API_HASH"]
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)

async def create_session(phone, code, phone_code_hash, password):
    client = None
    try:
        session_str = await redis.get(f"tg:session_temp:{phone}")
        if session_str:
            session_str = base64.urlsafe_b64decode(session_str).decode()

        logger.info("Session redis: %s", session_str)
        # Ensure string format (decode if bytes)

        client = TelegramClient(StringSession(session_str), api_id, api_hash)
        await client.connect()
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)

        return client.session.save(), await client.get_me()
    except SessionPasswordNeededError:
        if not password:
            raise Exception("Password required")
        await client.sign_in(password=password)
        
        return client.session.save(), await client.get_me()
    finally:
        if client and not client.is_connected():
            await client.disconnect()
        

@app.route("/api/verify-code", methods=["POST"])
def verify_code():
    try:
        data = request.get_json()
        phone = data.get("phone")
        code = data.get("code")
        password = data.get("password", None)

        if not phone or not code:
            return jsonify({"error": "Missing phone or code"}), 400

        # Retrieve code hash
        phone_code_hash = asyncio.run(redis.get(f"tg:code_hash:{phone}"))
        logger.info("Old code hash: %s", phone_code_hash)

        if not phone_code_hash:
            return jsonify({"error": "Code expired or not sent"}), 400

        session_str, me = asyncio.run(create_session(phone, code, phone_code_hash, password))

        encoded = base64.urlsafe_b64encode(session_str.encode()).decode()

        asyncio.run(redis.set(f"tg:session:{me.id}", encoded, ex=60 * 60 * 24))
        asyncio.run(redis.set(f"tg:phone:{me.id}", phone, ex=60 * 60 * 24))

        return jsonify({"ok": True, "userId": me.id})

    except Exception as e:
        logger.error("❌ Verify code error: %s", e)
        return jsonify({"error": str(e)}), 500
