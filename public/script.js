class AuthHelper {
  static init() {
    console.log("AuthHelper initialized");
    this.doAuth().catch(console.error);
  }

  static async doAuth() {
    console.log("Starting authentication process");
    
    try {
      // 1. Check if we're running in Telegram WebApp
      Telegram.WebApp.expand(); // Expand the web app to full height
      
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      
      if (!userId) {
        alert("No user ID found in initData");
        this.showPhoneInput();
        return;
      }

      console.log("Checking user session for ID:", userId);
      
      // 2. Check Redis via your backend
      const response = await fetch(`/api/get-userinfo?userId=${userId}`);
      const data = await response.json();
      
      if (data.session) {
        this.showApp();
        return;
      }

      // 3. Check if we have a verification in progress
      const statusResponse = await fetch(`/api/check-code-status?userId=${userId}`);
      const statusData = await statusResponse.json();

      if (statusData.status) {
        console.log("Code verification in progress");
        this.showCodeInput(statusData.phone);
      } else {
        console.log("No active session, showing phone input");
        this.showPhoneInput();
      }
    } catch (error) {
      console.error("Authentication error:", error);
      alert("Authentication failed. Please try again.");
      this.showPhoneInput();
    }
  }

  static showApp() {
    console.log("Showing main application");
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("app-content").style.display = "block";
  }

  static showPhoneInput() {
    console.log("Showing phone input form");
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <div class="auth-form">
        <label>📱 Enter your phone number:</label>
        <input type="text" id="phone-input" placeholder="+1234567890" />
        <button onclick="submitPhone()">Send Code</button>
      </div>
    `;
    container.style.display = "block";
  }

  static showCodeInput(phone) {
    console.log("Showing code input form for phone:", phone);
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <div class="auth-form">
        <p>📨 Code sent to <strong>${phone}</strong></p>
        <label>💬 Enter the code:</label>
        <input type="text" id="code-input" placeholder="12345" />
        <button onclick="submitCode('${phone}')">Verify</button>
      </div>
    `;
    container.style.display = "block";
  }

  static showPasswordInput(phone, code) {
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <label>🔒 Enter your 2FA password:</label>
      <input type="password" id="password-input" />
      <button onclick="submitPassword('${phone}', '${code}')">Verify</button>
    `;
  }
}

// Make these functions available globally
window.submitPhone = async function() {
  const phone = document.getElementById("phone-input").value;
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  try {
    const res = await fetch("/api/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, userId })
    });

    const data = await res.json();

    if (res.ok) {
      AuthHelper.showCodeInput(phone);
    } else {
      alert("❌ " + (data.error || "Failed to send code"));
    }
  } catch (error) {
    console.error("Error submitting phone:", error);
    alert("Failed to send code. Please try again.");
  }
};

window.submitCode = async function(phone) {
  const code = document.getElementById("code-input").value;

  try {
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
      AuthHelper.showPasswordInput(phone, code);
    } else {
      alert("❌ " + (data.error || "Verification failed"));
    }
  } catch (error) {
    console.error("Error submitting code:", error);
    alert("Failed to verify code. Please try again.");
  }
};

window.submitPassword = async function(phone, code) {
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
        if (!chatId) {
          return;
        }
        
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

async function fetchAnalysis(chatId) {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: Telegram.WebApp.initDataUnsafe.user?.id,
            chat_id: parseInt(chatId),
            limit: 300
        })
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

async function promptForChatId() {
  const userId = Telegram.WebApp.initDataUnsafe.user?.id;
  const response = await fetch(`/api/list-chats?userId=${userId}`);
  const { chats } = await response.json();

  const modal = document.getElementById("chat-picker");
  modal.innerHTML = `
    <div class="chat-modal-overlay"></div>
    <div class="chat-modal">
      <button class="chat-modal-close">&times;</button>
      <h3 class="chat-modal-title">Select a Chat</h3>
      <ul class="chat-list">
        ${chats.map(chat => `
          <li class="chat-item" data-chat-id="${chat.chat_id}">
            <img src="${chat.avatar}" class="chat-avatar" alt="avatar" />
            <span class="chat-name">${chat.name}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
  modal.style.display = 'block';

  return new Promise(resolve => {
    modal.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.getAttribute('data-chat-id');
        modal.style.display = 'none';
        resolve(chatId);
      });
    });

    modal.querySelector('.chat-modal-close').addEventListener('click', () => {
      modal.style.display = 'none';
      resolve(null);
    });
  });
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