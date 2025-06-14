from upstash_redis import Redis
from flask import Flask, request, jsonify
import os
import logging
import base64

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Redis client
redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)

@app.route('/api/get-userinfo', methods=['GET'])
def get_session():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"error": "Missing userId"}), 400

    try:
        session = redis.get(f"tg:session:{user_id}")
        phone = redis.get(f"tg:phone:{user_id}")

        if session:
            session = base64.urlsafe_b64decode(session).decode()

        logger.info("GET userinfo: %s", session)

        return jsonify({
            "session": session,
            "phone": phone
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
