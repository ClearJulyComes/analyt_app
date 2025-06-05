from telethon.sync import TelegramClient
from telethon.sessions import StringSession
import redis
import os

# Configure Telegram API credentials
api_id = int(os.environ.get("TELEGRAM_API_ID"))
api_hash = os.environ.get("TELEGRAM_API_HASH")

# Configure Redis client
redis_client = redis.Redis.from_url(os.environ.get("UPSTASH_REDIS_REST_URL"))

def create_and_store_session(user_id: str, phone: str):
    if not user_id or not phone:
        raise ValueError("Missing user_id or phone")

    try:
        with TelegramClient(StringSession(), api_id, api_hash) as client:
            client.start(phone=phone)

            string_session = client.session.save()

            # Save session and phone to Redis with 24h expiration
            redis_client.setex(f"tg:session:{user_id}", 60 * 60 * 24, string_session)
            redis_client.setex(f"tg:phone:{user_id}", 60 * 60 * 24, phone)

            print("✅ Session and phone saved to Redis.")

    except Exception as e:
        print("❌ Failed to create or store session:", str(e))
