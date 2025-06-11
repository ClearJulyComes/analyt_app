import os
import logging
import base64
import httpx
import asyncio

from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User
from werkzeug.exceptions import HTTPException


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

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
                await client.disconnect()
                response = await http_client.post(f"{WEBAPP_URL}/api/delete-session", json={"userId": user_id})
                return jsonify({"error": "Unauthorized"}), 401

            dialogs = await client.get_dialogs(limit=30)
            user_entities = [
                dialog.entity for dialog in dialogs
                    if isinstance(dialog.entity, User)
                        and not getattr(dialog.entity, 'bot', False)
                        and not getattr(dialog.entity, 'is_self', False)
                        and dialog.entity.id != 777000
            ]

            semaphore = asyncio.Semaphore(10)

            async def get_chat_info(entity):
                avatar_base64 = None
                try:
                    async with semaphore:
                        photo = await client.download_profile_photo(entity, file=bytes, download_big=False)
                    if photo:
                        avatar_base64 = f"data:image/jpeg;base64,{base64.b64encode(photo).decode()}"
                except Exception as e:
                    logger.warning(f"Failed to get photo for {entity.id}: {e}")

                return {
                    "chat_id": str(entity.id),
                    "name": getattr(entity, "title", None) or getattr(entity, "first_name", "Unknown"),
                    "avatar": avatar_base64
                }

            # Run concurrently
            logger.info("photos download started")
            chat_list = await asyncio.gather(*[get_chat_info(user) for user in user_entities])
            logger.info("photos download finished")

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
    logger.info("list-chats started")
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"error": "Missing userId"}), 400

    try:
        result = asyncio.run(get_user_session(user_id))
        if isinstance(result, tuple):
            return jsonify(result[0]), result[1]  # if unauthorized
        logger.info("list-chats ended")
        return jsonify(result), 200
    except Exception as e:
        logger.exception("Chat list fetch failed")
        return jsonify({"error": str(e)}), 500