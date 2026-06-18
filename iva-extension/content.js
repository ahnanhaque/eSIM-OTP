// ========================================================
// 🛑 আপনার Render বটের লিংকটি এখানে বসানো হয়েছে:
const BOT_API_URL = "https://esim-otp-btup.onrender.com/api/ivas-data"; 
// ========================================================

let isFetching = false;

// পেজের কোণায় একটি ভাসমান স্ট্যাটাস বার তৈরি করা
const statusUI = document.createElement("div");
statusUI.style = "position:fixed;TOP:20px;right:20px;background:rgba(0,0,0,0.8);color:#0f0;padding:10px 15px;border-radius:8px;z-index:999999;font-family:monospace;font-size:14px;box-shadow: 0 0 10px #0f0;";
statusUI.innerHTML = "🚀 iVAS Bridge: Waiting...";
document.body.appendChild(statusUI);

function updateStatus(msg, color = "#0f0") {
    statusUI.innerHTML = `⚡ Fast Bridge:<br><span style="color:${color};">${msg}</span>`;
    statusUI.style.boxShadow = `0 0 10px ${color}`;
}

function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function sendToBot(type, payload) {
    try {
        await fetch(BOT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, payload })
        });
        console.log(`✅ [Bridge] Fast Sent ${type} to Bot!`);
    } catch (e) {
        updateStatus("Bot Offline / Link Error!", "red");
    }
}

async function runBridge() {
    if (isFetching) return;
    isFetching = true;

    try {
        const token = document.querySelector('meta[name="csrf-token"]')?.content;
        if (!token) {
            updateStatus("Waiting for Login...", "orange");
            isFetching = false;
            return;
        }

        updateStatus("Syncing Live Data...", "cyan");

        const ts = Date.now();
        const fetchOptions = {
            method: "GET",
            credentials: "same-origin",
            headers: { 
                "X-CSRF-TOKEN": token, 
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest" 
            } 
        };

        // 🟢 ১. নাম্বার ও রেঞ্জ ফেচ করা
        const numUrl = `/portal/numbers?draw=1&columns[0][data]=number_id&columns[1][data]=Number&columns[2][data]=range&order[0][column]=1&order[0][dir]=desc&start=0&length=5000&_=${ts}`;
        const numRes = await fetch(numUrl, fetchOptions);
        if (numRes.ok) {
            const numJson = await numRes.json();
            let activeRanges = {};
            if (numJson && numJson.data) {
                numJson.data.forEach(row => {
                    const r = row.range || "UNKNOWN";
                    const n = String(row.Number || "");
                    if (!activeRanges[r]) activeRanges[r] = [];
                    activeRanges[r].push(n);
                });
                // ব্যাকগ্রাউন্ডে পাঠিয়ে দিচ্ছি, ওয়েট করার দরকার নেই
                sendToBot("RANGES", activeRanges); 
            }
        }

        // 🟢 ২. নতুন এসএমএস ও ওটিপি ফেচ করা (High Speed Parallel Fetching)
        const today = getToday();
        let formData = new FormData();
        formData.append("from", today);
        formData.append("to", today);
        formData.append("_token", token);

        const postOptions = {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" } 
        };

        const r1 = await fetch("/portal/sms/received/getsms", { ...postOptions, body: formData });
        const r1Text = await r1.text();
        const ranges = [...r1Text.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
        
        let allSms = [];

        // রেঞ্জ লুপ
        for (const range of ranges) {
            let b2 = new URLSearchParams({ _token: token, start: today, end: today, range });
            const r2 = await fetch("/portal/sms/received/getsms/number", { 
                ...postOptions, 
                headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
                body: b2 
            });
            const r2Text = await r2.text();
            const numbers = [...r2Text.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);
            
            // 🚀 ম্যাজিক: সব নাম্বার একসাথে চেক করবে (Parallel Processing)
            const smsPromises = numbers.map(async (number) => {
                let b3 = new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range });
                const r3 = await fetch("/portal/sms/received/getsms/number/sms", { 
                    ...postOptions, 
                    headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
                    body: b3 
                });
                const r3Text = await r3.text();
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(r3Text, 'text/html');
                const rows = doc.querySelectorAll('tr');
                
                let localSms = [];
                rows.forEach(row => {
                    if (row.querySelector('th')) return; 
                    const msgEl = row.querySelector('.msg-text');
                    const timeEl = row.querySelector('.time-cell');
                    if (msgEl && timeEl) {
                        localSms.push({ 
                            number, 
                            time: `${today} ${timeEl.innerText.trim()}`, 
                            message: msgEl.innerText.trim(), 
                            range 
                        });
                    }
                });
                return localSms;
            });

            // সব নাম্বারের রেজাল্ট একসাথে জমা করা
            const results = await Promise.all(smsPromises);
            results.forEach(res => allSms.push(...res));
        }

        if (allSms.length > 0) {
            await sendToBot("SMS_LOG", allSms);
        }

        updateStatus("✅ Superfast Sync Complete!", "#0f0");

    } catch (err) {
        updateStatus("Network Error! Retrying...", "red");
    }

    // কাজ শেষ হওয়ামাত্রই লক খুলে দেবে
    isFetching = false; 
}

// 🚀 আগের ৫ সেকেন্ডের জায়গায় এখন প্রতি ২ সেকেন্ডে চেক করবে!
setInterval(runBridge, 2000);