const tg = window.Telegram.WebApp;
tg.expand();

// Set user name
document.getElementById('user-name').textContent = 
    tg.initDataUnsafe.user?.first_name || "User";

// Main function to analyze chat
async function analyzeChat() {
    try {
        const loadingText = document.getElementById('loading-text');
        const resultDiv = document.getElementById('result');
        
        loadingText.style.display = 'block';
        resultDiv.innerHTML = '';
        
        // First request message access
        tg.sendData(JSON.stringify({
            action: "request_messages",
            limit: 100  // Get last 100 messages
        }));
        
        // Handle response from Telegram
        tg.onEvent('messageReceived', (eventData) => {
            const messages = JSON.parse(eventData).messages;
            
            fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    messages: messages,
                    user_id: tg.initDataUnsafe.user?.id 
                })
            })
            .then(response => response.json())
            .then(data => {
                loadingText.style.display = 'none';
                displayResults(data);
            });
        });
        
    } catch (error) {
        console.error("Error:", error);
        document.getElementById('result').innerHTML = 
            `<p class="error">Error: ${error.message}</p>`;
    }
}

// Display formatted results
function displayResults(data) {
    let html = `
        <div class="analysis-section">
            <h3>Conversation Analysis</h3>
            <div class="metric">
                <span class="metric-title">Who starts conversations:</span>
                <span class="metric-value">${data.starter_stats}</span>
            </div>
            <div class="metric">
                <span class="metric-title">Message count:</span>
                <span class="metric-value">${data.message_count}</span>
            </div>
            <div class="metric">
                <span class="metric-title">Sentiment analysis:</span>
                <span class="metric-value">${data.sentiment}</span>
            </div>
        </div>
    `;
    document.getElementById('result').innerHTML = html;
}

// Event listener
document.getElementById('analyze-btn').addEventListener('click', analyzeChat);