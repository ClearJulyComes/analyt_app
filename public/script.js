class AuthHelper {
    static async getPhoneNumber() {
        console.log("[DEBUG] Checking initDataUnsafe.user:", Telegram.WebApp.initDataUnsafe.user);
        
        // Method 1: Check if already available
        const tgUser = Telegram.WebApp.initDataUnsafe.user;
        if (tgUser?.phone_number) {
            console.log("[DEBUG] Found phone in initData:", tgUser.phone_number);
            return tgUser.phone_number;
        }

        // Method 2: Request via Telegram UI
        console.log("[DEBUG] Requesting phone via popup");
        return new Promise((resolve) => {
            Telegram.WebApp.showPopup({
                title: "Phone Required",
                message: "Please share your phone number",
                buttons: [{
                    type: "default",
                    text: "Share Phone",
                    callback: () => {
                        console.log("[DEBUG] Share button clicked");
                        // New: Use contact request API
                        Telegram.WebApp.sendData(JSON.stringify({
                            action: "request_contact"
                        }));
                        
                        Telegram.WebApp.onEvent('contactReceived', (data) => {
                            const phone = JSON.parse(data).phone_number;
                            console.log("[DEBUG] Received phone:", phone);
                            resolve(phone);
                        });
                    }
                }]
            });
            
            // Fallback after 5 seconds
            setTimeout(() => {
                console.log("[DEBUG] Phone request timeout");
                resolve(null);
            }, 5000);
        });
    }
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
        console.log("[DEBUG] Using phone:", phone);

        console.log("[DEBUG] Requesting chat ID");
        const chatId = await promptForChatId();
        console.log("[DEBUG] Analyzing chat:", chatId);
        
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

// Update event listener with debug
document.getElementById('analyze-btn').addEventListener('click', () => {
    console.log("[DEBUG] Analyze button clicked");
    analyzeRealChat().catch(console.error);
});