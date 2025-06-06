from http.server import BaseHTTPRequestHandler
from telethon.sync import TelegramClient
from telethon.tl.types import InputPeerUser
import json, os, asyncio
from telethon.sessions import StringSession
from collections import defaultdict
from datetime import datetime, timedelta
import httpx
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
WEBAPP_URL = os.getenv('WEBAPP_URL')
TELEGRAM_API_ID = os.getenv('TELEGRAM_API_ID')
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

async def analyze_messages(user_id, chat_id, limit=100):

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{WEBAPP_URL}/api/get-userinfo", params={"userId": user_id})

        if response.status_code == 200:
            data = response.json()
            session = data.get("session")
            phone = data.get("phone")
        else:
            print("Error:", response.json())

        async with TelegramClient(StringSession(session), int(TELEGRAM_API_ID), TELEGRAM_API_HASH) as client:
            await client.start(phone)
            entity = await client.get_entity(chat_id)
            messages = []
            
            async for msg in client.iter_messages(entity, limit=limit):
                messages.append({
                    'sender_id': msg.sender_id,
                    'text': msg.text or "",
                    'date': msg.date
                })

            messages.reverse()  # oldest to newest for chronological logic

            # Analysis containers
            message_counts = defaultdict(int)
            sentiment_counts = defaultdict(lambda: defaultdict(int))
            starter_counts = defaultdict(int)

            last_timestamp = None
            idle_threshold = timedelta(minutes=60)
            sentiment_summary, explanation = await get_sentiments_summary(messages)

            for i, msg in enumerate(messages):
                sender = msg['sender_id']
                text = msg['text']
                timestamp = msg['date']

                # Count messages
                message_counts[sender] += 1

                # Conversation starter logic
                if i == 0 or (last_timestamp and (timestamp - last_timestamp) > idle_threshold):
                    starter_counts[sender] += 1
                last_timestamp = timestamp

            return {
                'message_count': format_stats(message_counts),
                'starter_stats': format_stats(starter_counts),
                'sentiment_summary': sentiment_summary,
                'sentiment_explanation': explanation,
                'total_messages': len(messages)
            }

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        data = json.loads(self.rfile.read(content_length))
        
        try:
            result = loop.run_until_complete(
                analyze_messages(
                    user_id=data['user_id'],
                    chat_id=data['chat_id'],
                    limit=data.get('limit', 100)
                )
            )
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_error(500, f"Analysis failed: {str(e)}")

def format_stats(stats):
    total = sum(stats.values())
    return {k: f"{v} ({v/total:.0%})" for k, v in stats.items()}

async def get_sentiments_summary(messages):
    from collections import defaultdict

    grouped = defaultdict(list)
    for msg in messages:
        if msg['text'].strip():
            grouped[msg['sender_id']].append(msg['text'])

    user_blocks = [
        f"User {user_id}:\n" + "\n".join(f"- {text}" for text in texts)
        for user_id, texts in grouped.items()
    ]

    prompt = (
        "You will be given a list of users and their recent messages. For each user:\n"
        "1. Estimate their overall sentiment score (0% = negative, 100% = positive).\n"
        "2. Add a label: 'negative', 'neutral', or 'positive'.\n"
        "3. If the majority of the messages are in a language other than English (e.g. Russian), explanation in your response — MUST be in that same language.\n"
        "4. In explanation provide psychological portrait of persons and interesting things you found.\n"
        "5. Return JSON only with structure:\n"
        "{users: [ {user1: 'label - score%'}, ... ], explanation: '...'}\n\n"
        "Messages:\n\n" + "\n\n".join(user_blocks)
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
        response = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=120.0  # long enough for batch
        )

        if response.status_code != 200:
            print(f"[DeepSeek] Error: {response.status_code} - {response.text}")
            return {}

        try:
            logger.info("[DeepSeek] Raw response: %s", response.text)
            content = response.json()["choices"][0]["message"]["content"]
            cleaned = re.sub(r"^```json\s*|\s*```$", "", content.strip(), flags=re.DOTALL)
            parsed = json.loads(cleaned)

            # Convert users list into {user_id: sentiment} dict
            sentiment_map = {}
            for entry in parsed.get("users", []):
                for uid_str, value in entry.items():
                    sentiment_map[int(uid_str)] = value

            explanation = parsed.get("explanation", "")
            return sentiment_map, explanation

        except Exception as e:
            print(f"[DeepSeek] Failed to parse: {e}")
            return {}, ""