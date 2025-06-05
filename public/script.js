class AuthHelper {
  static async getPhoneNumber(userId) {
    // 1. Check Redis via your backend
    const existing = await fetch(`/api/get-userinfo?userId=${userId}`);
    const data = await existing.json();

    if (data.phone) {
      return data.phone;
    }

    // 2. Prompt for phone
    const userInput = prompt("📱 Please enter your phone number:");
    if (!userInput) return null;

    const phone = userInput.trim();

    // 3. Save phone and init session (optional chaining logic)
    const response = await fetch("/api/save-userinfo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        phone
      })
    });

    const result = await response.json();

    if (!result.ok) {
      console.error("❌ Failed to save phone");
      return null;
    }

    return phone;
  }
}

// Add debug prints to all functions
async function analyzeRealChat() {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    try {
        loading.style.display = 'block';
        result.innerHTML = '';

        const phone = await AuthHelper.getPhoneNumber();
        if (!phone) throw new Error("Phone number required");

        const chatId = await promptForChatId();
        
        const analysis = await fetchAnalysis(chatId);
        
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
    const formatStats = (stats, label) => {
        return Object.entries(stats)
            .map(([user, value]) => `<div>User <strong>${user}</strong>: ${value}</div>`)
            .join('');
    };

    result.innerHTML = `
        <div class="analysis-card">
            <h3>Chat Analysis</h3>

            <div class="metric">
                <span class="metric-title">Conversation starters:</span>
                <div class="metric-value">
                    ${formatStats(data.starter_stats, 'Starter')}
                </div>
            </div>

            <div class="metric">
                <span class="metric-title">Message counts:</span>
                <div class="metric-value">
                    ${formatStats(data.message_count, 'Messages')}
                </div>
            </div>

            <div class="metric metric-flex-column">
              <div class="metric-row">
                <span class="metric-title">Sentiment Analysis:</span>
                <div class="metric-value sentiment-summary">${formatStats(data.sentiment_summary, 'Sentiment')}</div>
              </div>
              <div class="metric-explanation">${data.sentiment_explanation}</div>
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
    analyzeRealChat().catch(console.error);
});