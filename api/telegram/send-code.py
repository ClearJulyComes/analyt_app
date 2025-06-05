from flask import Flask, request, jsonify
from telethon.sessions import StringSession
from telethon import TelegramClient  # ✅ Use async version
from telethon.errors import (
    PhoneNumberInvalidError,
    PhoneNumberBannedError,
    FloodWaitError
)
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

# ✅ Async function to send the login code
async def create_session(phone):
    async with TelegramClient(StringSession(), api_id, api_hash) as client:

        try:
            sent = await client.send_code_request(phone)
            redis.set(f"tg:code_hash:{phone}", sent.phone_code_hash, ex=300)
        except PhoneNumberInvalidError:
            raise Exception("❌ Invalid phone number")
        except PhoneNumberBannedError:
            raise Exception("❌ Phone number banned")
        except FloodWaitError as e:
            raise Exception(f"❌ Too many attempts. Wait {e.seconds} seconds")
        except Exception as e:
            raise Exception(f"❌ Unknown error: {str(e)}")

@app.route("/api/send-code", methods=["POST"])
def send_code():
    try:
        data = request.get_json()
        phone = data.get("phone")
        if not phone:
            return jsonify({"error": "Missing phone"}), 400

        # ✅ Run async function inside Flask
        asyncio.run(create_session(phone))

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
