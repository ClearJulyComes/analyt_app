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
        # Get target chat (simplified - works for PMs)
        entity = InputPeerUser(chat_id, 0)
        
        # Fetch messages
        messages = []
        async for msg in client.iter_messages(entity, limit=limit):
            messages.append({
                'sender_id': msg.sender_id,
                'text': msg.text or "",
                'date': msg.date.isoformat()
            })
        
        # Simple analysis
        starter_stats = {}
        message_counts = {}
        
        for msg in messages:
            sender = msg['sender_id']
            message_counts[sender] = message_counts.get(sender, 0) + 1
            
            if not messages or msg == messages[0]:
                starter_stats[sender] = starter_stats.get(sender, 0) + 1
        
        return {
            'starter_stats': format_stats(starter_stats),
            'message_count': format_stats(message_counts),
            'total_messages': len(messages)
        }
        
    finally:
        await client.disconnect()

def format_stats(stats):
    total = sum(stats.values())
    return {k: f"{v} ({v/total:.0%})" for k, v in stats.items()}

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