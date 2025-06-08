import os
import logging
import base64
import json
import re
import asyncio
import datetime
import httpx
from quart import Quart, request, jsonify
from collections import defaultdict
from datetime import datetime, timedelta
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User, Chat, Channel
from upstash_redis.asyncio import Redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Quart(__name__)

WEBAPP_URL = os.getenv('WEBAPP_URL')
TELEGRAM_API_ID = int(os.getenv('TELEGRAM_API_ID'))
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)


def format_stats(stats):
    total = sum(stats.values())
    if total == 0:
        return {k: f"{v} (0%)" for k, v in stats.items()}
    return {k: f"{v} ({v / total:.0%})" for k, v in stats.items()}


async def get_sentiments_summary(user_blocks):
    prompt = (
        "Analyze this conversation chronologically. For each participant:\n"
        "1. FIRST detect the primary language of ALL messages (count Russian vs English messages)\n"
        "2. If >50% messages are Russian, the ENTIRE response (including JSON) MUST BE in Russian\n"
        "3. Track sentiment evolution (0-100% scores over time)\n"
        "4. Final sentiment label (negative/neutral/positive)\n"
        "5. Psychological portrait focusing on:\n"
        "   - Communication style\n"
        "   - Emotional patterns\n"
        "   - Possible personality traits\n"
        "6. Interaction dynamics between them\n\n"
        "7. Return only strict JSON (double-quoted keys and values). The `explanation` must be a single string with clear sections per user and second user info should be from new line, like: \"User A: ... \nUser B: ...\". Like this:\n"
        "{\"users\": [ {\"user_name\": \"label - score%\"}, ... ], \"explanation\": \"...\"}\n\n"
        "Messages in chronological order:\n\n" + "\n\n".join(user_blocks)
    )

    headers = {
        "Authorization": f"Bearer {os.getenv('DEEPSEEK_API_KEY')}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    }

    async with httpx.AsyncClient() as client:
        logger.info("deepseek request started")
        response = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=120.0
        )
        logger.info("deepseek request ended")

        if response.status_code != 200:
            logger.error("[DeepSeek] Error: %s - %s", response.status_code, response.text)
            return {}, ""

        try:
            content = response.json()["choices"][0]["message"]["content"]
            cleaned = re.sub(r"^```json\s*|\s*```$", "", content.strip(), flags=re.DOTALL)
            parsed = json.loads(cleaned)

            sentiment_map = {}
            for entry in parsed.get("users", []):
                for uid_str, value in entry.items():
                    sentiment_map[uid_str] = value

            return sentiment_map, parsed.get("explanation", "")
        except Exception as e:
            logger.error("[DeepSeek] Failed to parse: %s", e)
            return {}, ""


async def analyze_messages(user_id, chat_id, limit=100):
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

        entity = None
        dialogs = await client.get_dialogs()
        for dialog in dialogs:
            if str(dialog.entity.id) == str(chat_id):
                entity = dialog.entity
                break

        if entity is None:
            raise ValueError(f"Could not find chat with ID {chat_id} in recent dialogs")

        messages = []

        logger.info("messages load started")

        async for msg in client.iter_messages(entity, limit=limit):

            messages.append({
                'sender_id': msg.sender_id,
                'text': msg.text or "",
                'date': msg.date,
                'id': msg.id
            })
        logger.info("messages load finished")

        messages.reverse()

        message_counts = defaultdict(int)
        starter_counts = defaultdict(int)
        last_timestamp = None
        idle_threshold = timedelta(minutes=60)

        for i, msg in enumerate(messages):
            sender = msg['sender_id']
            text = msg['text']
            timestamp = msg['date']

            message_counts[sender] += 1
            if i == 0 or (last_timestamp and (timestamp - last_timestamp) > idle_threshold):
                starter_counts[sender] += 1
            last_timestamp = timestamp

        grouped_by_sender = defaultdict(list)
        for msg in messages:
            if msg['text'].strip():
                grouped_by_sender[msg['sender_id']].append(msg['text'])

        async def fetch_sender_name(sender_id):
            try:
                sender = await client.get_entity(sender_id)
                return sender_id, (
                    getattr(sender, "first_name", None)
                    or getattr(sender, "username", None)
                    or f"User {sender_id}"
                )
            except Exception:
                return sender_id, f"User {sender_id}"

        sender_id_name_pairs = await asyncio.gather(*(fetch_sender_name(sid) for sid in grouped_by_sender.keys()))
        sender_id_to_name = dict(sender_id_name_pairs)

        message_counts_by_name = defaultdict(int)
        starter_counts_by_name = defaultdict(int)

        for sender_id, count in message_counts.items():
            sender_name = sender_id_to_name.get(sender_id, f"User {sender_id}")
            message_counts_by_name[sender_name] += count

        for sender_id, count in starter_counts.items():
            sender_name = sender_id_to_name.get(sender_id, f"User {sender_id}")
            starter_counts_by_name[sender_name] += count

        user_blocks = [
            f"{sender_id_to_name[sender_id]}:\n" + "\n".join(f"- {text}" for text in texts)
            for sender_id, texts in grouped_by_sender.items()
        ]

        sentiment_summary, explanation = await get_sentiments_summary(user_blocks)

        await client.disconnect()
        result = {
            'message_count': format_stats(message_counts_by_name),
            'starter_stats': format_stats(starter_counts_by_name),
            'sentiment_summary': sentiment_summary,
            'sentiment_explanation': explanation,
            'total_messages': len(messages),
            'last_message_id': messages[-1]['id'] if messages else None,
            'cached_at': datetime.now().isoformat()
        }

        cache_key = generate_cache_key(user_id, chat_id)

        await cache_analysis(cache_key, result)

        return result

    finally:
        await http_client.aclose()

def generate_cache_key(user_id: str, chat_id: str) -> str:
    return f"tganalysis:{user_id}:{chat_id}"

async def cache_analysis(key: str, data: dict):
    await redis.set(key, json.dumps(data))

async def get_cached_analysis(key: str) -> dict:
    """Retrieve cached analysis if exists"""
    cached = await redis.get(key)
    return json.loads(cached) if cached else None


@app.route("/api/analyze", methods=["POST"])
async def analyze_endpoint():
    try:
        data = await request.get_json()
        user_id = data.get("user_id")
        chat_id = data.get("chat_id")
        limit = data.get("limit", 100)
        force_refresh = data.get("force_refresh", False)

        cache_key = f"tganalysis:{user_id}:{chat_id}"

        if not force_refresh:
            logger.info("Get cashed analyze for: %s", chat_id)
            cached = await get_cached_analysis(cache_key)
            if cached:
                return jsonify({
                    **cached,
                    "is_cached": True
                })
            else:
                return jsonify({"error": "No cache"}), 404

        if not user_id or not chat_id:
            return jsonify({"error": "Missing user_id or chat_id"}), 400

        result = await analyze_messages(user_id, chat_id, limit)
        logger.info("analyze ended")
        return jsonify(result)
    except Exception as e:
        logger.exception("Analyze endpoint failed")
        return jsonify({"error": str(e)}), 500
