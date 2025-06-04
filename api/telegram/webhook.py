import os
import asyncio
import json
import time
from urllib.parse import parse_qs
from telegram import (
    Update,
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton
)
from telegram.ext import (
    ApplicationBuilder,
    ContextTypes,
    MessageHandler,
    CommandHandler,
    filters
)
# from telegram.utils.webapp import validate_webapp_init_data

# Configuration
WEBAPP_URL = os.getenv('WEBAPP_URL')
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
SESSION_TIMEOUT = 300  # 5 minutes

class SessionManager:
    """Temporary session storage for verification"""
    def __init__(self):
        self.sessions = {}  # In production, replace with Redis
    
    def create_session(self, user_id: int) -> str:
        import secrets
        token = secrets.token_urlsafe(16)
        self.sessions[token] = {
            'user_id': user_id,
            'timestamp': time.time()
        }
        return token
    
    def validate_session(self, token: str) -> bool:
        session = self.sessions.get(token)
        if not session:
            return False
        if time.time() - session['timestamp'] > SESSION_TIMEOUT:
            del self.sessions[token]
            return False
        return True

session_manager = SessionManager()

async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start commands with different parameters"""
    command = update.message.text.split()[1] if len(update.message.text.split()) > 1 else None
    
    if command == 'webapp_phone':
        # Create verification session
        token = session_manager.create_session(update.effective_user.id)
        
        # Request phone number
        await update.message.reply_text(
            "🔒 Please verify your phone number:",
            reply_markup=ReplyKeyboardMarkup(
                [[KeyboardButton("📱 Share Phone", request_contact=True)]],
                one_time_keyboard=True,
                resize_keyboard=True
            )
        )
    else:
        # Regular start command - show WebApp button
        await update.message.reply_text(
            "📊 Open Chat Analyzer:",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(
                    "Open Analysis Tool",
                    web_app={'url': f"{WEBAPP_URL}?start={update.effective_user.id}"}
                )
            ]])
        )

async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Process shared phone numbers"""
    if not update.message.contact:
        return
    
    phone = update.message.contact.phone_number
    user_id = update.effective_user.id
    
    # Generate verification token (would be more secure in production)
    verification_token = session_manager.create_session(user_id)
    
    await update.message.reply_text(
        "✅ Verification successful! Return to your analysis:",
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton(
                "Continue in App",
                web_app={'url': f"{WEBAPP_URL}?phone={phone}&token={verification_token}"}
            )
        ]])
    )

async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Validate and process WebApp data"""
    if not update.message.web_app_data:
        return
    
    try:
        # Validate initData signature
        init_data = update.message.web_app_data.data
        # if not validate_webapp_init_data(init_data, TELEGRAM_BOT_TOKEN):
        #     await update.message.reply_text("❌ Invalid request signature")
        #     return
        
        # Parse WebApp data
        webapp_data = json.loads(update.message.web_app_data.data)
        user_phone = webapp_data.get('user', {}).get('phone_number')
        
        if not user_phone:
            await update.message.reply_text("⚠️ Phone number required")
            return
        
        # Process analysis request (would call your analyze.py)
        await update.message.reply_text(
            f"🔍 Analysis started for {user_phone}",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(
                    "View Results",
                    web_app={'url': f"{WEBAPP_URL}?analysis=done"}
                )
            ]])
        )
        
    except Exception as e:
        await update.message.reply_text(f"⚠️ Error: {str(e)}")
        print(f"WebApp data error: {str(e)}")

def setup_application():
    """Configure bot handlers"""
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Command handlers
    app.add_handler(CommandHandler("start", handle_start))
    
    # Message handlers
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(MessageHandler(filters.TEXT & filters.Regex(".*"), handle_webapp_data))
    
    return app

app = setup_application()

async def process_webhook(request_data: dict):
    """Process incoming webhook update"""
    try:
        await app.initialize()
        update = Update.de_json(request_data, app.bot)
        await app.process_update(update)
    except Exception as e:
        print(f"Webhook processing error: {str(e)}")
        raise
    finally:
        await app.shutdown()

def webhook(request):
    try:
        request_data = request.get_json()
        loop = asyncio.get_event_loop()
        loop.run_until_complete(process_webhook(request_data))

        return {'statusCode': 200, 'body': 'OK'}

    except Exception as e:
        print(f"Webhook error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
