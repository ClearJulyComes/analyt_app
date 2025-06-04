from http.server import BaseHTTPRequestHandler
from telethon.sync import TelegramClient
from telethon.tl.types import InputPeerUser
import json, os, asyncio
from datetime import datetime
from telethon.sessions import StringSession

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

        for i, msg in enumerate(messages):
            sender = msg['sender_id']
            text = msg['text']
            timestamp = msg['date']

            # Count messages
            message_counts[sender] += 1

            # Sentiment analysis
            sentiment = get_sentiment(text)
            sentiment_counts[sender][sentiment] += 1

            # Conversation starter logic
            if i == 0 or (last_timestamp and (timestamp - last_timestamp) > idle_threshold):
                starter_counts[sender] += 1
            last_timestamp = timestamp

        return {
            'message_count': format_stats(message_counts),
            'starter_stats': format_stats(starter_counts),
            'sentiment_breakdown': {
                sender: format_stats(sentiments)
                for sender, sentiments in sentiment_counts.items()
            },
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

async def get_sentiment(text: str) -> str:
    """Call DeepSeek LLM to analyze sentiment of a message."""
    prompt = f"Classify the sentiment of this message as 'positive', 'neutral', or 'negative':\n\n{text}"

    headers = {
        "Authorization": f"Bearer {os.getenv('DEEPSEEK_API_KEY')}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "deepseek-chat",  # Adjust if you use another model name
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=20.0
        )

        if response.status_code != 200:
            print(f"[DeepSeek] Error: {response.status_code} - {response.text}")
            return "neutral"

        result = response.json()
        reply = result["choices"][0]["message"]["content"].strip().lower()

        # Normalize output
        if "positive" in reply:
            return "positive"
        elif "negative" in reply:
            return "negative"
        else:
            return "neutral"