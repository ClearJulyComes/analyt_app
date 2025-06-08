class AuthHelper {
  static init() {
    console.log("AuthHelper initialized");
    this.doAuth().catch(console.error);
  }

  static async doAuth() {
    console.log("Starting authentication process");
    
    try {
      Telegram.WebApp.expand();
      
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      
      if (!userId) {
        alert("No user ID found in initData");
        this.showPhoneInput();
        return;
      }

      console.log("Checking user session for ID:", userId);
      
      const response = await fetch(`/api/get-userinfo?userId=${userId}`);
      const data = await response.json();
      
      if (data.session) {
        this.showApp();
        return;
      }

      const statusResponse = await fetch(`/api/check-code-status?userId=${userId}`);
      const statusData = await statusResponse.json();

      if (statusData.status) {
        console.log("Code verification in progress");
        this.showCodeInput(userId, statusData.phone);
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

    this.loadChats();
    this.loadCachedAnalysis()
  }

  static async loadChats() {
    try {
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      if (!userId) return;

      const response = await fetch(`/api/list-chats?userId=${userId}`);
      const data = await response.json();

      if (data.chats) {
        window.__cachedChats = data.chats;
        console.log("[DEBUG] Chats preloaded:", data.chats.length);
      } else {
        console.warn("No chats found for user");
      }
    } catch (error) {
      console.error("Failed to preload chats:", error);
    }
  }

  static async loadCachedChat(chatId) {
    try {
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      if (!userId) return null;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          chat_id: parseInt(chatId),
          force_refresh: false
        })
      });
      
      return await response.json();
    } catch (error) {
      console.error("Cache load failed:", error);
      return null;
    }
  }

  static async loadCachedAnalysis() {
    try {
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      if (!userId) return null;

      const cache_chat_ids = window.__cachedChats?.map(chat => chat.chat_id) || [];
      if (cache_chat_ids.length === 0) {
          console.warn("No chats available for analysis preloading");
          return null;
      }

      const response = await fetch('/api/cached-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          chat_ids: cache_chat_ids
        })
      });

      if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
      
      const data = await response.json();
      if (data) {
        window.__cachedAnalyse = new Map(
            Object.entries(data).map(([chat_id, analysis]) => [chat_id, analysis])
        );
      }

      return null;
    } catch (error) {
      console.error("Cache load failed:", error);
      return null;
    }
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

  static showCodeInput(userId, phone) {
    console.log("Showing code input form for phone:", phone);
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <div class="auth-form">
        <p>📨 Code sent to <strong>${phone}</strong></p>
        <label>💬 Enter the code:</label>
        <input type="text" id="code-input" placeholder="12345" />
        <button onclick="submitCode('${userId}', '${phone}')">Verify</button>
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

window.submitCode = async function(userId, phone) {
  const code = document.getElementById("code-input").value;

  try {
    const res = await fetch("/api/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, phone, code })
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
        
        displayResults(chatId, analysis);
        
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
            limit: 300,
            force_refresh: true
        })
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

async function promptForChatId() {
  const cachedChats = window.__cachedChats;
  const chats = cachedChats || (await (await fetch(`/api/list-chats?userId=${Telegram.WebApp.initDataUnsafe.user?.id}`)).json()).chats;

  const modal = document.getElementById("chat-picker");
  modal.innerHTML = `
    <div class="chat-modal-overlay"></div>
    <div class="chat-modal">
      <button class="chat-modal-close">&times;</button>
      <h3 class="chat-modal-title">Select a Chat</h3>
      <ul class="chat-list">
        ${chats.map(chat => `
          <li class="chat-item" data-chat-id="${chat.chat_id}">
            <img src="${chat.avatar}" class="chat-avatar" alt="avatar" onerror="this.src='https://placehold.co/40?text=TG'"/>
            <div class="chat-meta">
              <div class="chat-name">${chat.name}</div>
              <div class="chat-preview" id="preview-${chat.chat_id}">
                <div class="preview-loader"></div>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
  modal.style.display = 'block';

  const getCachedAnalysis = async (chatId) => {
    return window.__cachedAnalyse?.get(chatId) || await AuthHelper.loadCachedChat(chatId);
  };

  await Promise.all(chats.map(async chat => {
    const previewEl = document.getElementById(`preview-${chat.chat_id}`);
    try {
      const cached = await getCachedAnalysis(chat.chat_id);
      previewEl.innerHTML = cached && !cached.error ? `
        <div class="cached-preview">
          <div class="cached-preview-header">
            <span>Last Analysis</span>
            <span class="cached-preview-date">${new Date(cached.cached_at).toLocaleDateString()}</span>
          </div>
          <div class="mini-sentiment">
            ${Object.entries(cached.sentiment_summary || {})
              .map(([user, sentiment]) => 
                `<span class="sentiment-tag">${user}: ${sentiment}</span>`
              ).join('')}
          </div>
        </div>
      ` : '<div class="no-cache">No previous analysis</div>';
    } catch (error) {
      previewEl.innerHTML = '<div class="no-cache">Error loading</div>';
    }
  }));

  return new Promise(resolve => {
    modal.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        (async () => {
          const chatId = item.getAttribute('data-chat-id');
          modal.style.display = 'none';

          const cached = await getCachedAnalysis(chatId);
          if (cached && !cached.error) {
            displayResults(chatId, cached);
          }

          resolve(chatId);
        })();
      }); 
    });

    modal.querySelector('.chat-modal-close').addEventListener('click', () => {
      modal.style.display = 'none';
      resolve(null);
    });
  });
}



function displayResults(chatId, data) {
  const result = document.getElementById('result');
  const loading = document.getElementById('loading');
  if (!result) return;
  const formatStats = (stats, label) => {
    return Object.entries(stats)
      .map(([user, value]) => `<div><strong>${user}</strong>: ${value}</div>`)
      .join('');
  };

  const cachedBadge = data.is_cached ? `
    <div class="cached-badge">
        ⏱️ Cached report (${new Date(data.cached_at).toLocaleString()})
    </div>
  ` : '';

  const updateButton = `
    <button id="update-report-btn" class="tg-button">
        🔄 Update Report
    </button>
  `;
  loading.style.display = 'none';

  result.innerHTML = `
      <div class="analysis-card">
          ${cachedBadge}
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
          ${updateButton}
      </div>
  `;

  document.getElementById('update-report-btn')?.addEventListener('click', async () => {
      await updateAnalysis(chatId);
  });
}

async function updateAnalysis(chatId) {
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  
  try {
      loading.style.display = 'block';
      result.innerHTML = '<div class="loading-text">Updating analysis...</div>';

      const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              user_id: Telegram.WebApp.initDataUnsafe.user?.id,
              chat_id: parseInt(chatId),
              limit: 300,
              force_refresh: true
          })
      });

      if (!response.ok) throw new Error(await response.text());
      const newAnalysis = await response.json();
      
      displayResults(chatId, newAnalysis);
      
  } catch (error) {
      console.error("Update failed:", error);
      Telegram.WebApp.showAlert(`Update failed: ${error.message}`);
  } finally {
      loading.style.display = 'none';
  }
}

document.getElementById('analyze-btn').addEventListener('click', () => {
    console.log("[DEBUG] Analyze button clicked");
    analyzeRealChat().catch(console.error);
});