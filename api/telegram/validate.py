from http.server import BaseHTTPRequestHandler
from telegram.utils.webapp import validate_webapp_init_data
import os

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        init_data = self.rfile.read(content_length).decode()
        
        try:
            is_valid = validate_webapp_init_data(
                init_data,
                token=os.getenv('BOT_TOKEN')
            )
            
            self.send_response(200 if is_valid else 403)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "valid": is_valid,
                "user": parse_init_data(init_data) if is_valid else None
            }).encode())
            
        except Exception as e:
            self.send_error(500, str(e))

def parse_init_data(init_data: str) -> dict:
    """Extract user data from validated initData"""
    from urllib.parse import parse_qs
    return {
        k: v[0] for k, v in parse_qs(init_data).items() 
        if k.startswith('user')
    }