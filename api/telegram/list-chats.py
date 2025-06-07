import os
import logging
import base64
import httpx
import asyncio

from flask import Flask, request, jsonify
from upstash_redis import Redis
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User, Chat, Channel
from werkzeug.exceptions import HTTPException


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Redis client
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)
WEBAPP_URL = os.getenv('WEBAPP_URL')
TELEGRAM_API_ID = os.getenv('TELEGRAM_API_ID')
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')

async def get_user_session(user_id):
    if not user_id:
        return

    http_client = None
    try:
        http_client = httpx.AsyncClient()
        response = await http_client.get(
            f"{WEBAPP_URL}/api/get-userinfo",
            params={"userId": user_id}
        )

        if response.status_code != 200:
            logger.error("Failed to fetch user info: %s", response.text)
            raise Exception(f"Failed to fetch user info: {response.status_code} - {response.text}")

        data = response.json()
        session = data.get("session")

        if not session:
            raise ValueError("Missing session or phone in response")

        client = TelegramClient(StringSession(session), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        try:
            await client.connect()
            if not await client.is_user_authorized():
                return jsonify({"error": "Unauthorized"}), 401

            chat_list = []

            async for dialog in client.iter_dialogs(limit=10):
                entity = dialog.entity
                if isinstance(entity, (User, Chat, Channel)) and not getattr(entity, 'bot', False):
                    avatar_base64 = None

                    try:
                        photo = await client.download_profile_photo(entity, file=bytes, download_big=False)
                        if photo:
                            avatar_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo).decode()}"
                    except Exception as e:
                        logger.warning(f"Failed to get photo for {entity.id}: {e}")

                    chat_list.append({
                        "chat_id": str(entity.id),
                        "name": getattr(entity, "title", None) or getattr(entity, "first_name", "Unknown"),
                        "avatar": avatar_base64
                    })

            return {"chats": chat_list}
        except Exception as e:
            logger.exception("Chat list fetch failed")
            return {"error": str(e)}, 500

        finally:
            await client.disconnect()
    finally:
        if http_client:
            await http_client.aclose()


@app.route("/api/list-chats", methods=['GET'])
def list_chats():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"error": "Missing userId"}), 400

    try:
        result = asyncio.run(get_user_session(user_id))
        if isinstance(result, tuple):
            return jsonify(result[0]), result[1]  # if unauthorized

        return jsonify(result), 200
    except Exception as e:
        logger.exception("Chat list fetch failed")
        return jsonify({"error": str(e)}), 500