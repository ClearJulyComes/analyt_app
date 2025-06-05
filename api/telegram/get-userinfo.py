from flask import Flask, request, jsonify
import redis
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Redis client
redis_client = redis.Redis.from_url(os.environ.get("UPSTASH_REDIS_REST_URL"))

@app.route('/api/get-userinfo', methods=['GET'])
def get_session():
    user_id = request.args.get("userId")
    
    if not user_id:
        return jsonify({"error": "Missing userId"}), 400

    try:
        session = redis_client.get(f"tg:session:{user_id}")
        phone = redis_client.get(f"tg:phone:{user_id}")

        return jsonify({
            "session": session.decode() if session else None,
            "phone": phone.decode() if phone else None
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
