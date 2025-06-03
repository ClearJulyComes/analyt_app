class AuthHelper {
    static async getPhoneNumber() {
        // Method 1: Check WebApp initData first
        const tgUser = Telegram.WebApp.initDataUnsafe.user;
        if (tgUser?.phone_number) {
            return tgUser.phone_number;
        }

        // Method 2: Request phone via Telegram UI
        return new Promise((resolve, reject) => {
            Telegram.WebApp.showPopup({
                title: "Verification Required",
                message: "Please share your phone number to analyze chats",
                buttons: [{
                    type: "default",
                    text: "Share Phone",
                    callback: () => {
                        // Open native Telegram phone request
                        Telegram.WebApp.openTelegramLink("tg://resolve?domain=Telegram&start=attach_phone");
                        
                        // Listen for phone result
                        Telegram.WebApp.onEvent('phoneRequested', (data) => {
                            if (data && data.phone) {
                                resolve(data.phone);
                            } else {
                                reject(new Error("Phone sharing cancelled"));
                            }
                        });
                    }
                }]
            });
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