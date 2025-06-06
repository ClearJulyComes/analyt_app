from flask import Flask, request, jsonify
from telethon.sessions import StringSession
from telethon import TelegramClient  # ✅ Use async version
from telethon.errors import (
    PhoneNumberInvalidError,
    PhoneNumberBannedError,
    FloodWaitError
)
import os
from upstash_redis.asyncio import Redis
import asyncio
import logging
import base64

app = Flask(__name__)

api_id = int(os.environ["TELEGRAM_API_ID"])
api_hash = os.environ["TELEGRAM_API_HASH"]
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ✅ Async function to send the login code
async def create_session(user_id, phone):
    client = None
    try:
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        sent = await client.send_code_request(phone)
        session_str = client.session.save()

        logger.info("Session RAW: %s", session_str)
        encoded = base64.urlsafe_b64encode(session_str.encode()).decode()

        await redis.set(f"tg:session_temp:{phone}", encoded, ex=300)  # 5 minutes
        stored = await redis.get(f"tg:session_temp:{phone}")
        # if isinstance(stored, bytes):
        #     stored = stored.decode("utf-8")
        if stored:
            stored = base64.urlsafe_b64decode(stored).decode()

        logger.info("Saved session: %s", session_str)
        logger.info("Redis readback: %s", stored)
        logger.info("Match? %s", session_str == stored)

        await redis.set(f"tg:code_hash:{phone}", sent.phone_code_hash, ex=300)
        await redis.set(f"tg:phone:{user_id}", phone, ex=300)
    except PhoneNumberInvalidError:
        raise Exception("❌ Invalid phone number")
    except PhoneNumberBannedError:
        raise Exception("❌ Phone number banned")
    except FloodWaitError as e:
        raise Exception(f"❌ Too many attempts. Wait {e.seconds} seconds")
    except Exception as e:
        raise Exception(f"❌ Unknown error: {str(e)}")
    finally:
        if client and not client.is_connected():
            await client.disconnect()

@app.route("/api/send-code", methods=["POST"])
def send_code():
    try:
        data = request.get_json()
        phone = data.get("phone")
        user_id = data.get("userId")
        if not phone:
            return jsonify({"error": "Missing phone"}), 400

        # ✅ Run async function inside Flask
        result = asyncio.run(create_session(user_id, phone))

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/check-code-status", methods=["GET"])
def check_code_status():
    try:
        # Get parameters from query string
        phone = request.args.get("phone")
        
        if not phone:
            return jsonify({"error": "Missing phone parameter"}), 400
        
        # Check if code is valid (implementation depends on your logic)
        code_hash = await redis.get(f"tg:code_hash:{phone}")
        if not code_hash:
            logger.info("No code")
            return jsonify({"status": False, "message": "No verification request found for this phone"})
        
        logger.info("Verify code: %s", code_hash)
        return jsonify({
            "status": True,
            "message": "Code hash persist"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# This is important for Vercel to recognize the Flask app
if __name__ == '__main__':
    app.run()
