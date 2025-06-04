from http.server import BaseHTTPRequestHandler
from telethon.sync import TelegramClient
from telethon.tl.types import InputPeerUser
import json, os, asyncio
from telethon.sessions import StringSession
from collections import defaultdict
from datetime import datetime, timedelta
import httpx

async def analyze_messages(phone, chat_id, limit=100):
    client = TelegramClient(
        session=StringSession(os.getenv("TELEGRAM_SESSION_STRING")),
        api_id=int(os.getenv('TELEGRAM_API_ID')),
        api_hash=os.getenv('TELEGRAM_API_HASH')
    )
    
    await client.start(phone)
    
    try:
        entity = InputPeerUser(chat_id, 0)
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
        idle_threshold = timedelta(minutes=30)
        sentiment = get_sentiments_summary(messages)

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
            'sentiment_summary': await sentiment,
            'total_messages': len(messages)
        }

    finally:
        await client.disconnect()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        data = json.loads(self.rfile.read(content_length))
        
        try:
            loop = asyncio.new_event_loop()
            result = loop.run_until_complete(
                analyze_messages(
                    phone=data['phone'],
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
        "You will be given a list of users with their messages. For each user, estimate their overall sentiment "
        "as a score from 0% (very negative) to 100% (very positive). Also include a label like 'negative', 'neutral', or 'positive'.\n"
        "Return a JSON object with this format:\n"
        "{\n  \"user_id\": \"label - score%\"\n}\n\n"
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

        content = response.json()["choices"][0]["message"]["content"]

        try:
            result = json.loads(content)
            return {int(k): v for k, v in result.items()}
        except Exception as e:
            print(f"[DeepSeek] Failed to parse DeepSeek response: {e}\n{content}")
            return {}