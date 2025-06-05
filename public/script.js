class AuthHelper {
  static async getPhoneNumber() {
    // 1. Check Redis via your backend
    const userId = Telegram.WebApp.initDataUnsafe.user?.id;
    const existing = await fetch(`/api/get-userinfo?userId=${userId}`);
    const data = await existing.json();

    if (data.phone) {
      return data.phone;
    }

    return startAuthFlow();
  }
}

async function startAuthFlow() {
  const phone = prompt("📱 Enter your phone number:");
  if (!phone) return;

  // STEP 1: Request Telegram to send a code
  const sendCodeRes = await fetch("/api/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });

  const sendCodeData = await sendCodeRes.json();
  if (!sendCodeRes.ok) {
    alert("❌ Failed to send code: " + sendCodeData.error);
    return;
  }

  // STEP 2: Ask user for code
  const code = prompt("💬 Enter the code sent by Telegram:");
  if (!code) return;

  // STEP 3: Try verifying with just code
  let password = null;
  let verifyRes = await fetch("/api/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code })
  });

  let verifyData = await verifyRes.json();

  // STEP 4: If password is required (2FA), prompt and retry
  if (verifyData.error === "Password required") {
    password = prompt("🔒 Enter your 2FA password:");
    if (!password) return;

    verifyRes = await fetch("/api/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, password })
    });

    verifyData = await verifyRes.json();
  }

  if (!verifyRes.ok || !verifyData.ok) {
    alert("❌ Failed to verify: " + (verifyData.error || "Unknown error"));
    return;
  }

  // ✅ Success
  const userId = verifyData.userId;
  alert(`✅ Logged in as user ${userId}`);
}



// Add debug prints to all functions
async function analyzeRealChat() {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    try {
        loading.style.display = 'block';
        result.innerHTML = '';

        await AuthHelper.getPhoneNumber();

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