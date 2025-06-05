class AuthHelper {
  static async doAuth() {
    alert("Start auth");
    // 1. Check Redis via your backend
    const userId = Telegram.WebApp.initDataUnsafe.user?.id;
    const existing = await fetch(`/api/get-userinfo?userId=${userId}`);
    const data = await existing.json();
    if (data.session) {
      AuthHelper.showApp();
      return data.phone;
    }

    const res = await fetch(`/api/check-code-status?userId=${userId}`);
    const data = await res.json();

    if (data.status) {
        showCodeInput(data.phone);
    } else {
        showPhoneInput();
    }
  }

  static showApp() {
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("app-content").style.display = "block";
  }
}

function showPhoneInput() {
  const container = document.getElementById("auth-container");
  container.innerHTML = `
    <label>📱 Enter your phone number:</label>
    <input type="text" id="phone-input" />
    <button onclick="submitPhone()">Send Code</button>
  `;
}

async function submitPhone() {
  const phone = document.getElementById("phone-input").value;
  const userId = Telegram.WebApp.initDataUnsafe.user?.id;

  const res = await fetch("/api/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, userId })
  });

  const data = await res.json();

  if (res.ok) {
    showCodeInput(phone);
  } else {
    alert("❌ " + data.error);
  }
}

function showCodeInput(phone) {
  const container = document.getElementById("auth-container");
  container.innerHTML = `
    <p>📨 Code sent to <strong>${phone}</strong></p>
    <label>💬 Enter the code:</label>
    <input type="text" id="code-input" />
    <button onclick="submitCode('${phone}')">Verify</button>
  `;
}

async function submitCode(phone) {
  const code = document.getElementById("code-input").value;

  const res = await fetch("/api/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code })
  });

  const data = await res.json();

  if (res.ok && data.ok) {
    alert(`✅ Logged in as user ${data.userId}`);
    AuthHelper.showApp();
  } else if (data.error === "Password required") {
    showPasswordInput(phone, code);
  } else {
    alert("❌ " + data.error);
  }
}

function showPasswordInput(phone, code) {
  const container = document.getElementById("auth-container");
  container.innerHTML = `
    <label>🔒 Enter your 2FA password:</label>
    <input type="password" id="password-input" />
    <button onclick="submitPassword('${phone}', '${code}')">Verify</button>
  `;
}

async function submitPassword(phone, code) {
  const password = document.getElementById("password-input").value;

  const res = await fetch("/api/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, password })
  });

  const data = await res.json();

  if (res.ok && data.ok) {
    alert(`✅ Logged in as user ${data.userId}`);
    AuthHelper.showApp();
  } else {
    alert("❌ " + data.error);
  }
}

// Add debug prints to all functions
async function analyzeRealChat() {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    try {
        loading.style.display = 'block';
        result.innerHTML = '';

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

async function fetchAnalysis(chatId) {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: Telegram.WebApp.initDataUnsafe.user?.id;,
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