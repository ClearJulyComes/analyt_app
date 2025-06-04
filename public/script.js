class AuthHelper {
    static async getPhoneNumber() {
        return new Promise((resolve) => {
            const userInput = prompt("📱 Please enter your phone number:");
            if (userInput) {
                // Optionally validate it
                resolve(userInput.trim());
            } else {
                resolve(null);
            }
        });
    }
}

async function validateInitData() {
    // const response = await fetch('/api/validate', {
    //     method: 'POST',
    //     headers: {'Content-Type': 'text/plain'},
    //     body: Telegram.WebApp.initData
    // });
    
    // const { valid, user } = await response.json();
    // if (valid) {
    analyzeRealChat();
    // } else {
    //     Telegram.WebApp.showAlert("Authentication failed");
    // }
}

// Add debug prints to all functions
async function analyzeRealChat() {
    console.log("[DEBUG] analyzeRealChat started");
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    try {
        loading.style.display = 'block';
        result.innerHTML = '';

        console.log("[DEBUG] Getting phone number");
        const phone = await AuthHelper.getPhoneNumber();
        if (!phone) throw new Error("Phone number required");
        alert("[DEBUG] Using phone:", phone);

        console.log("[DEBUG] Requesting chat ID");
        const chatId = await promptForChatId();
        alert("[DEBUG] Analyzing chat:", chatId);
        
        console.log("[DEBUG] Calling API");
        const analysis = await fetchAnalysis(phone, chatId);
        console.log("[DEBUG] Analysis result:", analysis);
        
        displayResults(analysis);
        
    } catch (error) {
        console.error("[ERROR]", error);
        result.innerHTML = `
            <div class="error">
                ${error.message || "Analysis failed"}
            </div>
        `;
    } finally {
        loading.style.display = 'none';
        console.log("[DEBUG] Analysis completed");
    }
}

// Helper functions
async function promptForChatId() {
    // In a real app, implement proper chat selection UI
    return prompt("Enter numeric chat ID (User ID or Group ID with -):");
}

async function fetchAnalysis(phone, chatId) {
    alert('Fetch analysis' + phone + ' ' + chatId)
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

// Update event listener with debug
document.getElementById('analyze-btn').addEventListener('click', () => {
    console.log("[DEBUG] Analyze button clicked");
    validateInitData().catch(console.error);
});