class AuthHelper {
  static init() {
    console.log("AuthHelper initialized");
    this.doAuth().catch(console.error);
  }

  static async doAuth() {
    console.log("Starting authentication process");
    
    try {
      Telegram.WebApp.expand();

      const isDarkTheme = Telegram.WebApp.colorScheme === 'dark';
      document.body.classList.toggle('dark', isDarkTheme);
      
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
      alert(t('auth_error'));
      this.showPhoneInput();
    }
  }

  static showApp() {
    console.log("Showing main application");
    this.loadChats();

    const locale = Telegram.WebApp.initDataUnsafe.user?.language_code;

    document.getElementById("auth-container").style.display = "none";
    document.getElementById("app-content").style.display = "block";

    alert(t('welcome'))
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
        this.loadCachedAnalysis()
      } else {
        console.warn("No chats found for user");
      }
    } catch (error) {
      AuthHelper.init();
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
        <label>${t('enter_phone')}</label>
        <input type="text" id="phone-input" placeholder="+1234567890" value="+7" />
        <button class="button" onclick="submitPhone()">${t('send_code')}</button>
        <div class="auth-footer">
          <p class="legal-text">
            ${t('agree_description')} <a href="#"id="terms-a">${t('terms')}</a> & <a href="#" id="privacy-a">${t('privacy')}</a>
          </p>
        </div>
      </div>
    `;
    container.style.display = "block";

    const user = Telegram?.WebApp?.initDataUnsafe?.user;
    let locale = user?.language_code || 'en';
    if (locale != 'ru') {
      locale = 'en';
    }

    const showModalWithContent = async (type) => {
      try {
        alert(`show modal`);
        document.getElementById('modal-text-term').innerHTML = 'Loading...';
        alert(`show modal 2`);
        document.getElementById('modal-term').style.display = 'block';
        alert(`show modal 3`);
        Telegram.WebApp.setBackgroundColor('#00000066');
        alert(`show modal 4`);
        
        const content = await getTerm(locale, type);
        document.getElementById('modal-text-term').innerHTML = content;
      } catch (error) {
        console.error(`Error loading ${type}:`, error);
        document.getElementById('modal-text-term').innerHTML = `Error loading ${type}`;
      }
    };

    // Add event listeners after DOM update
    setTimeout(() => {
      document.getElementById('terms-a')?.addEventListener('click', async () => {
        alert(`click terms`);
        await showModalWithContent("terms");
      });

      document.getElementById('privacy-a')?.addEventListener('click', async () => {
        await showModalWithContent("privacy");
      });
    }, 0);

    // Close handlers (can be outside setTimeout as they're static elements)
    document.getElementById('modal-close-term')?.addEventListener('click', () => {
      document.getElementById('modal-term').style.display = 'none';
      Telegram.WebApp.setBackgroundColor('#ffffff');
    });

    window.addEventListener('click', (event) => {
      if (event.target === document.getElementById('modal-term')) {
        document.getElementById('modal-term').style.display = 'none';
        Telegram.WebApp.setBackgroundColor('#ffffff');
      }
    });
  }

  static showCodeInput(userId, phone) {
    console.log("Showing code input form for phone:", phone);
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <div class="auth-form">
        <p>${t('code_sent_to')} <strong>${phone}</strong></p>
        <label>${t('enter_code')}</label>
        <input type="text" id="code-input" placeholder="12345" />
        <button class="button" onclick="submitCode('${userId}', '${phone}')">${t('verify')}</button>
      </div>
    `;
    container.style.display = "block";
  }

  static showPasswordInput(phone, code) {
    const container = document.getElementById("auth-container");
    container.innerHTML = `
      <div class="auth-form">
        <label>${t('enter_password')}</label>
        <input type="password" id="password-input" />
        <button class="button" onclick="submitPassword('${phone}', '${code}')">${t('verify')}</button>
      </div>
    `;
  }
}

async function getTerm(locale, type) {
  alert(`get terms locale: ${locale} and type: ${type}`)
  let response;
  if (type == 'terms') {
    response = await fetch(`/terms_${locale}.html`);
  } else {
    response = await fetch(`/privacy_${locale}.html`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  alert(`get response`)
  return await response.text()
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
      AuthHelper.showCodeInput(userId, phone);
    } else {
      alert("❌ " + (data.error || t('send_code_failed')));
    }
  } catch (error) {
    console.error("Error submitting phone:", error);
    alert(t('send_code_failed'));
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
      alert(`${t('login_success')} ${data.userId}`);
      AuthHelper.showApp();
    } else if (data.error === "Password required") {
      AuthHelper.showPasswordInput(phone, code);
    } else {
      alert("❌ " + (data.error || t('verification_failed')));
    }
  } catch (error) {
    console.error("Error submitting code:", error);
    alert(t('code_verification_failed'));
  }
};

window.submitPassword = async function(phone, code) {
  const password = document.getElementById("password-input").value;
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  const res = await fetch("/api/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, phone, code, password })
  });

  const data = await res.json();

  if (res.ok && data.ok) {
    alert(`${t('login_success')} ${data.userId}`);
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

        await promptForChatId();
    } catch (error) {
        console.error("[ERROR]", error);
        result.innerHTML = `
            <div class="error">
                ${error.message || t('analysis_failed')}
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
            limit: 600,
            force_refresh: true
        })
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

async function promptForChatId() {
  const cachedChats = window.__cachedChats;
  let chats;
  if (cachedChats) {
    chats = cachedChats;
  } else {
    try {
      const res = await fetch(`/api/list-chats?userId=${Telegram?.WebApp?.initDataUnsafe?.user?.id}`);

      if (!res.ok) {
        console.error('Error fetching chats. Server responded with a non-200 code.');

        return AuthHelper.init();
      } else {
        const data = await res.json();
        chats = data.chats;
      }
    } catch (error) {
      console.error("[ERROR]", error);
    }
  }

  const modal = document.getElementById("chat-picker");
  modal.innerHTML = `
    <div class="chat-modal-overlay"></div>
    <div class="chat-modal">
      <button class="chat-modal-close">&times;</button>
      <h3 class="chat-modal-title">${t('select_chat')}</h3>
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
            <span>${t('last_analysis')}</span>
            <span class="cached-preview-date">${new Date(cached.cached_at).toLocaleDateString()}</span>
          </div>
          <div class="mini-sentiment">
            ${Object.entries(cached.sentiment_summary || {})
              .map(([user, sentiment]) => 
                `<span class="sentiment-tag">${user}: ${sentiment}</span>`
              ).join('')}
          </div>
        </div>
      ` : `<div class="no-cache">${t('no_analysis')}</div>`;
    } catch (error) {
      previewEl.innerHTML = `<div class="no-cache">${t('error_loading')}</div>`;
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
          } else {
            const analysis = await fetchAnalysis(chatId);
            displayResults(chatId, analysis);
          }
        })();
      }); 
    });

    modal.querySelector('.chat-modal-close').addEventListener('click', () => {
      modal.style.display = 'none';
      resolve(null);
    });
  });
}

let translations = {};

async function loadTranslations() {
    try {
      const res = await fetch('/translations.json'); 
        translations = await res.json();
    } catch (error) {
        console.error("Error loading translations:", error);
    }
}

function t(key) {
    const locale = Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en';
    return translations[locale]?.[key] ||
          translations.en?.[key] ||
          key;
}

function setText() {
    document.querySelector("#title").innerText = t('title');
    document.querySelector("#main_description").innerText = t('main_description');
    document.querySelector("#logout").innerText = t('logout');
    document.querySelector("#clear_cache").innerText = t('clear_cache');
    document.querySelector("#analyze-btn").innerText = t('select_chat');
    document.querySelector("#loading").innerText = t('analyzing_loader');
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
        ${t('cached_report')} (${new Date(data.cached_at).toLocaleString()})
    </div>
  ` : '';

  const updateButton = `
    <button id="update-report-btn" class="tg-button">
        ${t('update_report')}
    </button>
  `;
  loading.style.display = 'none';

  result.innerHTML = `
      <div class="analysis-card">
          ${cachedBadge}
          <h3>Chat Analysis</h3>

          <div class="metric">
              <span class="metric-title">${t('conversation_starters')}</span>
              <div class="metric-value">
                  ${formatStats(data.starter_stats, 'Starter')}
              </div>
          </div>

          <div class="metric">
              <span class="metric-title">${t('message_counts')}</span>
              <div class="metric-value">
                  ${formatStats(data.message_count, 'Messages')}
              </div>
          </div>

          <div class="metric metric-flex-column">
            <div class="metric-row">
              <span class="metric-title">${t('sentiment_analysis')}</span>
              <div class="metric-value sentiment-summary">${formatStats(data.sentiment_summary, 'Sentiment')}</div>
            </div>
            <div class="metric-explanation">${data.sentiment_explanation}</div>
          </div>

          <div class="metric">
              <span class="metric-title">${t('total_analysed')}</span>
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
      result.innerHTML = `<div class="loading-text">${t('update_loader')}</div>`;

      const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              user_id: Telegram.WebApp.initDataUnsafe.user?.id,
              chat_id: parseInt(chatId),
              limit: 600,
              force_refresh: true
          })
      });

      if (!response.ok) throw new Error(await response.text());
      const newAnalysis = await response.json();
      
      displayResults(chatId, newAnalysis);
      
  } catch (error) {
      console.error("Update failed:", error);
      Telegram.WebApp.showAlert(`${t('update_failed')}: ${error.message}`);
  } finally {
      loading.style.display = 'none';
  }
}

async function logout() {
  const confirmed = confirm(t('logout_text'));
    if (!confirmed) return;

  await fetch('/api/delete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              user_id: Telegram.WebApp.initDataUnsafe.user?.id
          })
      });
  AuthHelper.init()
}

async function clearCache() {
  const confirmed = confirm(t('clear_cache_text'));
    if (!confirmed) return;

  await fetch('/api/cached-chats', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              user_id: Telegram.WebApp.initDataUnsafe.user?.id
          })
      });
  alert(t('cache_cleared'));
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();

  setText();

  document.getElementById('gear-button').addEventListener('click', () => {
    const menu = document.getElementById('gear-menu');
    menu.classList.toggle('hidden');
  });

  // Optional: Close menu on outside click
  document.addEventListener('click', (e) => {
    const gear = document.getElementById('gear-container');
    if (!gear.contains(e.target)) {
      document.getElementById('gear-menu').classList.add('hidden');
    }
  });

  document.getElementById('analyze-btn').addEventListener('click', () => {
      console.log("[DEBUG] Analyze button clicked");
      analyzeRealChat().catch(console.error);
  });
});