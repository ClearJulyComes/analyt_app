class AuthHelper {
    static async getPhoneNumber() {
        alert("[DEBUG] Checking initDataUnsafe.user:", Telegram.WebApp.initDataUnsafe.user);

        // Method 1: Already available
        const tgUser = Telegram.WebApp.initDataUnsafe.user;
        if (tgUser?.phone_number) {
            console.log("[DEBUG] Found phone in initData:", tgUser.phone_number);
            return tgUser.phone_number;
        }

        // Method 2: Ask via popup
        alert("[DEBUG] Requesting phone via popup");

        return new Promise((resolve) => {
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.log("[DEBUG] Phone request timeout");
                    resolved = true;
                    resolve(null);
                }
            }, 5000);

            Telegram.WebApp.showPopup({
                title: "Phone Required",
                message: "Please share your phone number",
                buttons: [
                    {
                        id: "share",
                        type: "default",
                        text: "Share Phone"
                    }
                ]
            }, (buttonId) => {
                if (resolved) return;

                resolved = true;
                clearTimeout(timeout);

                if (buttonId === "share") {
                    alert("[DEBUG] Share button clicked");
                    const isTelegram = typeof Telegram !== 'undefined' && Telegram.WebApp;

                    
                    if (isTelegram) {
                        Telegram.WebApp.openTelegramLink("tg://resolve?domain=analyt_app_bot");
                    } else {
                        // For Chrome debugging
                        window.location.href = "https://t.me/analyt_app_bot?start=phone";
                    }

                }

                resolve(null); // no phone yet; phone will come in later via new initData
            });
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