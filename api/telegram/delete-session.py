from quart import Quart, request, jsonify
from upstash_redis import Redis
from telethon import TelegramClient
from telethon.sessions import StringSession
import os
import logging
import httpx
import base64  # optional, in case decoding is reused elsewhere

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Quart(__name__)

# Initialize Redis client
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)
WEBAPP_URL = os.getenv('WEBAPP_URL')
TELEGRAM_API_ID = int(os.getenv('TELEGRAM_API_ID'))
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')

@app.route('/api/delete-session', methods=['POST'])
async def delete_session():
    data = await request.get_json()
    user_id = data.get("userId") if data else None

    if not user_id:
        return jsonify({"error": "Missing userId"}), 400
    http_client = httpx.AsyncClient()

    try:
        response = await http_client.get(f"{WEBAPP_URL}/api/get-userinfo", params={"userId": user_id})

        if response.status_code != 200:
            raise Exception(f"Failed to fetch user info: {response.status_code} - {response.text}")

        data = response.json()
        session = data.get("session")

        if not session:
            raise ValueError("Missing session or phone in response")
        client = TelegramClient(StringSession(session), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        await client.connect()

        if not await client.is_user_authorized():
            # Optional: remove session here via internal request
            await client.disconnect()
            raise Exception("Session expired")
        await client.log_out()

        redis.delete(f"tg:session:{user_id}")
        logger.info("Deleted session for userId: %s", user_id)
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.exception("Failed to delete session")
        return jsonify({"error": str(e)}), 500