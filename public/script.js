async function analyzeRealChat() {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    loading.style.display = 'block';
    result.innerHTML = '';
    
    try {
        // Get user data from Telegram
        const tgUser = Telegram.WebApp.initDataUnsafe.user;
        const phone = tgUser?.phone_number;
        
        if (!phone) {
            throw new Error("Phone number required");
        }
        
        // Get target chat ID (simplified - in real app use UI selection)
        const chatId = prompt("Enter target user ID (start with '-' for groups):");
        
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone,
                chat_id: parseInt(chatId),
                limit: 100
            })
        });
        
        const data = await response.json();
        
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
        
    } catch (error) {
        result.innerHTML = `
            <div class="error">
                Error: ${error.message}
            </div>
        `;
    } finally {
        loading.style.display = 'none';
    }
}

// Update event listener
document.getElementById('analyze-btn').addEventListener('click', analyzeRealChat);