const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function makeRequest(method, path, body, extraHeaders = {}, customCookies = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "cookie": customCookies !== null ? customCookies : (COOKIES || ""),
            "x-requested-with": "XMLHttpRequest",
            ...extraHeaders
        };

        if (body && method === "POST") {
            if (!headers["content-type"]) {
                headers["content-type"] = "application/json";
            }
            headers["content-length"] = Buffer.byteLength(body);
        }

        const req = https.request(BASE_URL + path, { method, headers }, res => {
            let chunks = [];
            res.on("data", d => chunks.push(d));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf-8");
                try { 
                    resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }); 
                } catch { 
                    resolve({ status: res.statusCode, headers: res.headers, data: text }); 
                }
            });
        });

        req.on("error", reject);
        if (body && method === "POST") req.write(body);
        req.end();
    });
}

// 🟢 MK Login API
async function login(email, password) {
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="email"`,
        ``,
        `${email}`,
        `--${boundary}`,
        `Content-Disposition: form-data; name="password"`,
        ``,
        `${password}`,
        `--${boundary}--`,
        ``
    ].join("\r\n");

    const res = await makeRequest("POST", "/API/login_action.php", body, {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "referer": "https://mknetworkbd.com/login.php",
        "origin": "https://mknetworkbd.com"
    });

    let newCookie = "";
    if (res.headers && res.headers["set-cookie"]) {
        newCookie = res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = newCookie;
    }

    if (res.data && res.data.status === "success") {
        return newCookie;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "MK Login failed");
}

// 🟢 MK Get Number API
async function getNumber(range, customCookie = null) {
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="action"`,
        ``,
        `get_number`,
        `--${boundary}`,
        `Content-Disposition: form-data; name="range"`,
        ``,
        `${range}`,
        `--${boundary}--`,
        ``
    ].join("\r\n");

    const res = await makeRequest("POST", "/API/api_handler_test.php", body, {
        "accept": "*/*",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "referer": "https://mknetworkbd.com/getnum_test.php",
        "origin": "https://mknetworkbd.com"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) {
        throw new Error("SESSION_EXPIRED");
    }
    if (res.data && res.data.status === "success" && res.data.number) {
        return res.data;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "SESSION_EXPIRED");
}

// 🟢 MK Check OTP info API (Corrected array targeting based on JSON)
async function checkInfo(customCookie = null) {
    // Shudhu LIVE OTP check korchi (action=check_otp)
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=check_otp`, null, {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "referer": "https://mknetworkbd.com/getnum_test.php"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) {
        return [];
    }

    // 🔥 Exact JSON Key fix: 'data' use korchi, 'history' noi
    if (res.data && res.data.status === "success") {
        if (res.data.data && Array.isArray(res.data.data)) {
            return res.data.data;
        }
    }
    
    return [];
}

// ============================================================
// 🟢 MODULAR ASSIGNMENT & POLLING LOGIC
// ============================================================

async function assignNumber(ctx) {
    const {
        chatId, messageId, queryId, sel, platform, panelEntry,
        bot, botInfo, db, saveDB, getCountryInfo, GROUP_INVITE_LINK,
        pendingRequests, inUseNumbers, activeNumberMessages, activeTimeouts
    } = ctx;

    bot.answerCallbackQuery(queryId, { text: "⏳ Fetching numbers...", show_alert: false }).catch(()=>{});
    const limit       = db.settings.maxNumbers || 4;
    const countryName = typeof panelEntry === "object" ? panelEntry.country : panelEntry;
    const methodName  = typeof panelEntry === "object" ? panelEntry.method  : "";
    let fetchedNums   = [];

    bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(() => {});

    let userP = db.userPanels[chatId] || {};
    let isUserMk = db.settings.userPanelAccess && userP.mkCookies;
    const cookieToUse = isUserMk ? userP.mkCookies : db.mkCookies;
    const credsToUse  = isUserMk ? userP.mkCreds : db.mkCreds;

    for (let i = 0; i < limit; i++) {
        try {
            const numData = await getNumber(sel, cookieToUse);
            const n = numData.number ? numData.number.replace("+", "") : "";
            if (n) {
                fetchedNums.push(n);
                inUseNumbers[n]    = true;
                pendingRequests[n] = { chatId, country: countryName, isMk: true, platform, cookie: cookieToUse };
            }
        } catch (e) {
            if (i === 0 && credsToUse?.email) {
                try {
                    const newCookie = await login(credsToUse.email, credsToUse.password);
                    if (isUserMk) db.userPanels[chatId].mkCookies = newCookie; else db.mkCookies = newCookie;
                    saveDB();
                    const retryData = await getNumber(sel, newCookie);
                    const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                    if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isMk: true, platform, cookie: newCookie }; continue; }
                } catch (err2) { break; }
            }
            break;
        }
    }

    if (fetchedNums.length === 0) {
        bot.editMessageText(`❌ Out of stock or error fetching the number.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }).catch(() => {});
        return;
    }

    const info    = getCountryInfo(countryName);
    let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
    let replyText = `🤖 **${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
    if (methodName) replyText += `\n📝 **Method:** ${methodName}`;
    replyText += `\n\n👇 _Click a number below to copy:_`;

    let actionMenu = { inline_keyboard: [] };
    fetchedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
    actionMenu.inline_keyboard.push(
        [{ text: "🔄 Change", callback_data: `assign_next_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
        [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
    );

    bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
        activeNumberMessages[chatId] = messageId;
        activeTimeouts[chatId] = setTimeout(() => {
            fetchedNums.forEach(n => { if (pendingRequests[n]) { delete pendingRequests[n]; delete inUseNumbers[n]; } });
            let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
            if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
            expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
            fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
            bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
            delete activeTimeouts[chatId]; 
        }, 15 * 60 * 1000);
    }).catch(() => {});
}

function startPolling(ctx) {
    const { pendingRequests, processFoundOTP } = ctx;
    setInterval(async () => {
        const reqs = Object.values(pendingRequests).filter(r => r.isMk);
        if (reqs.length === 0) return;

        const cookiesToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];
        for (const cookie of cookiesToPoll) {
            try {
                // Konodhoroner Date parameter pass korchina
                const records = await checkInfo(cookie);

                if (Array.isArray(records)) {
                    records.forEach(rec => {
                        let rawNum      = String(rec.phone_number || rec.number || "");
                        let cleanRecNum = rawNum.replace(/\D/g, "");
                        
                        if (cleanRecNum) {
                            let pendingKey = Object.keys(pendingRequests).find(
                                k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isMk && pendingRequests[k].cookie === cookie
                            );
                            
                            if (pendingKey) {
                                let status = String(rec.status || "").toLowerCase();
                                // JSON er 'otps' ba 'full_sms_list' dhore SMS extract korchi
                                let msg = rec.otps || rec.full_sms_list || rec.sms || rec.otp || rec.message || rec.text;
                                
                                if (status === "success" && msg) {
                                    if (typeof msg === "string" && !msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                        processFoundOTP(pendingKey, Date.now(), msg, pendingRequests[pendingKey].country);
                                    }
                                }
                            }
                        }
                    });
                }
            } catch (e) {}
        }
    }, 2500);
}

module.exports = { login, setCookies, getNumber, checkInfo, assignNumber, startPolling };
