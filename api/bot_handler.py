from telegram import Update, Bot
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler
import os

# Environment variables
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
WEBAPP_URL = os.getenv('WEBAPP_URL') 

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if 'webapp' in update.message.text:
        await update.message.reply_text(
            "Open Mini App:",
            reply_markup={
                'inline_keyboard': [[{
                    'text': 'Analyze Chats',
                    'web_app': {'url': f"{WEBAPP_URL}?start={update.effective_user.id}"}
                }]]
            }
        )

async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    contact = update.message.contact
    await update.message.reply_text(
        f"Thanks! Return to analysis:",
        reply_markup={
            'inline_keyboard': [[{
                'text': 'Continue',
                'web_app': {'url': f"{WEBAPP_URL}?phone={contact.phone_number}"}
            }]]
        }
    )

def webhook(request):
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    
    async def process_update():
        await app.initialize()
        await app.process_update(Update.de_json(await request.json(), app.bot))
        await app.shutdown()
    
    import asyncio
    asyncio.run(process_update())
    
    return {'statusCode': 200}