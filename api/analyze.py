from http.server import BaseHTTPRequestHandler
import json
import os
import requests
from collections import defaultdict

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)
        
        messages = data.get('messages', [])
        
        # 1. Analyze who starts conversations
        conversation_starters = defaultdict(int)
        last_sender = None
        
        for msg in messages:
            if msg.get('is_start') or last_sender is None:
                conversation_starters[msg['from']['id']] += 1
            last_sender = msg['from']['id']
        
        # 2. Count messages per user
        message_counts = defaultdict(int)
        for msg in messages:
            message_counts[msg['from']['id']] += 1
        
        # 3. Sentiment analysis
        sentiment_prompt = """
        Analyze the sentiment of these messages on a scale from -1 (negative) to 1 (positive):
        Messages: {messages}
        Return ONLY a single float number between -1 and 1.
        """.format(messages="\n".join([m.get('text', '') for m in messages]))
        
        deepseek_response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.environ['DEEPSEEK_API_KEY']}",
                "Content-Type": "application/json"
            },
            json={
                "messages": [
                    {"role": "user", "content": sentiment_prompt}
                ],
                "temperature": 0.1
            }
        )
        
        sentiment_score = float(deepseek_response.json()['choices'][0]['message']['content'])
        sentiment = "Positive 😊" if sentiment_score > 0.3 else "Neutral 😐" if sentiment_score > -0.3 else "Negative 😠"
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            "starter_stats": format_starters(conversation_starters),
            "message_count": format_counts(message_counts),
            "sentiment": f"{sentiment} (score: {sentiment_score:.2f})"
        }).encode())

def format_starters(stats):
    total = sum(stats.values())
    return ", ".join([f"User {uid}: {count/total:.1%}" for uid, count in stats.items()])

def format_counts(counts):
    return ", ".join([f"User {uid}: {count} msgs" for uid, count in counts.items()])