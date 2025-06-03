class AuthHelper {
    static async function getPhoneNumber() {
    // Method 1: Check if already available
    const tgUser = Telegram.WebApp.initDataUnsafe.user;
    if (tgUser?.phone_number) {
        return tgUser.phone_number;
    }

    // Method 2: Request via Telegram UI (working solution)
    return new Promise((resolve) => {
        Telegram.WebApp.showPopup({
            title: "Phone Required",
            message: "Please open in Telegram app to share your number",
            buttons: [{
                type: "default",
                text: "Open in Telegram",
                callback: () => {
                    print('Request phone in Telegram')
                    // This forces the Mini App to open in native Telegram
                    Telegram.WebApp.openTelegramLink("tg://resolve?domain=analyt_app_bot");
                    
                    // Alternative fallback
                    window.location.href = "https://t.me/analyt_app_bot?start=phone";
                }
            }]
        });
        
        // Fallback after 5 seconds
        setTimeout(() => resolve(null), 5000);
    });
}
}

async function analyzeRealChat() {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    try {
        loading.style.display = 'block';
        result.innerHTML = '';

        // 1. Get authenticated phone
        const phone = await AuthHelper.getPhoneNumber();
        if (!phone) throw new Error("Phone number required");

        // 2. Get target chat (simplified - should be UI selection)
        const chatId = await promptForChatId();
        
        // 3. Call analysis API
        const analysis = await fetchAnalysis(phone, chatId);
        
        // 4. Display results
        displayResults(analysis);
        
    } catch (error) {
        result.innerHTML = `
            <div class="error">
                ${error.message || "Analysis failed"}
            </div>
        `;
    } finally {
        loading.style.display = 'none';
    }
}

// Helper functions
async function promptForChatId() {
    // In a real app, implement proper chat selection UI
    return prompt("Enter numeric chat ID (User ID or Group ID with -):");
}

async function fetchAnalysis(phone, chatId) {
    print('Fetch analysis')
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: phone,
            chat_id: parseInt(chatId),
            limit: 100
        })
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

function displayResults(data) {
// Format results
    result.innerHTML = `
        <div class="analysis-card">
            <h3>Chat Analysis</h3>
            <div class="metric">
                <span class="metric-title">Conversation starters:</span>
                <span class="metric-value">${Object.entries(data.starter_stats).map(([k,v]) => `User ${k}: ${v}`).join(', ')}</span>
            </div>
            <div class="metric">
                <span class="metric-title">Message counts:</span>
                <span class="metric-value">${Object.entries(data.message_count).map(([k,v]) => `User ${k}: ${v}`).join(', ')}</span>
            </div>
            <div class="metric">
                <span class="metric-title">Total analyzed:</span>
                <span class="metric-value">${data.total_messages} messages</span>
            </div>
        </div>
    `;
}

// Update event listener
document.getElementById('analyze-btn').addEventListener('click', analyzeRealChat);