from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError
import os
from upstash_redis import Redis
import logging
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

api_id = int(os.environ["TELEGRAM_API_ID"])
api_hash = os.environ["TELEGRAM_API_HASH"]
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

async def create_session(phone, code, phone_code_hash, password):
    client = None
    try:
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash.decode())
        
        return {client.session.save(), await client.get_me()}
    except SessionPasswordNeededError:
        if not password:
            return jsonify({"error": "Password required"}), 403
        await client.sign_in(password=password)
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
        phone_code_hash = redis.get(f"tg:code_hash:{phone}")

        if not phone_code_hash:
            return jsonify({"error": "Code expired or not sent"}), 400

        session_str, me = loop.run_until_complete(create_session(phone, code, phone_code_hash, password))

        redis.set(f"tg:session:{me.id}", session_str, 60 * 60 * 24)
        redis.set(f"tg:phone:{me.id}", phone, 60 * 60 * 24)

        return jsonify({"ok": True, "userId": me.id})

    except Exception as e:
        logger.error("❌ Verify code error: %s", e)
        return jsonify({"error": str(e)}), 500
