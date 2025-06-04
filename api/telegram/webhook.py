from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message.web_app_data:
        # Validate data from Mini App
        init_data = update.message.web_app_data.data
        if validate_webapp_init_data(init_data, token=os.getenv('BOT_TOKEN')):
            await process_analysis(update)

app = ApplicationBuilder().token(os.getenv('BOT_TOKEN')).build()
app.add_handler(MessageHandler(filters.WEB_APP_DATA, handle_message))

def webhook(request):
    async def process():
        await app.initialize()
        await app.process_update(Update.de_json(await request.json(), app.bot))
    asyncio.run(process())
    return {'statusCode': 200}