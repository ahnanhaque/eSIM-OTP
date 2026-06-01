const https = require("https");

const BASE_URL = "https://zenexnetwork.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function getCookies() {
    return COOKIES;
}

function makeRequest(method, path, body, extraHeaders = {}, customCookies = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "origin": BASE_URL,
            "referer": `${BASE_URL}/`,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "cookie": customCookies !== null ? customCookies : (COOKIES || ""),
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

// 🟢 Zenex Login
async function login(email, password) {
    const res = await makeRequest("POST", "/api/login", JSON.stringify({ email, password }));

    let newCookie = "";
    if (res.headers && res.headers["set-cookie"]) {
        newCookie = res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = newCookie;
    }

    if (res.data && res.data.success) {
        return newCookie;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Zenex Login failed");
}

// 🟢 Zenex Get Number
async function getNumber(range, customCookie = null) {
    const body = JSON.stringify({ range_id: range, is_national: false, remove_plus: false });

    try {
        const res = await makeRequest("POST", "/api/get-number", body, {}, customCookie);

        if (res.status === 401 || res.status === 403 || res.status === 302) {
            throw new Error("SESSION_EXPIRED");
        }

        if (res.data && res.data.success && res.data.data) {
            return { number: res.data.data.full_number || res.data.data.number };
        }
        
        throw new Error((res.data && res.data.message) ? res.data.message : "Out of stock or error");
    } catch (err) {
        if (err.message.includes("Unexpected token") || err.message.includes("JSON") || err.message.includes("SESSION_EXPIRED")) {
            throw new Error("SESSION_EXPIRED");
        }
        throw err;
    }
}

// 🟢 Check Info (Polling OTPs with Heartbeat)
async function checkInfo(customCookie = null) {
    if (!customCookie && !COOKIES) return [];

    try {
        const timestamp = Date.now();
        
        // 🟢 Heartbeat
        await makeRequest("GET", `/api/sync-orders?t=${timestamp}`, null, {}, customCookie);

        // OTP Check
        const res = await makeRequest("GET", `/api/check-otp?t=${timestamp}`, null, {}, customCookie);

        if (res.status === 401 || res.status === 403) {
            return []; 
        }

        if (res.data && res.data.success && Array.isArray(res.data.otps)) {
            return res.data.otps.map(item => ({
                number: item.number,
                sms: item.otp || item.message || item.text
            }));
        }
        return [];
    } catch (e) {
        return [];
    }
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
    let isUserZenex = db.settings.userPanelAccess && userP.zenexCookies;
    const cookieToUse = isUserZenex ? userP.zenexCookies : db.zenexCookies;
    const credsToUse  = isUserZenex ? userP.zenexCreds : db.zenexCreds;

    for (let i = 0; i < limit; i++) {
        try {
            const numData = await getNumber(sel, cookieToUse);
            const n = numData.number ? numData.number.replace("+", "") : "";
            if (n) {
                fetchedNums.push(n);
                inUseNumbers[n]    = true;
                pendingRequests[n] = { chatId, country: countryName, isZenex: true, platform, cookie: cookieToUse };
            }
        } catch (e) {
            if (i === 0 && credsToUse?.email) {
                try {
                    const newCookie = await login(credsToUse.email, credsToUse.password);
                    if (isUserZenex) db.userPanels[chatId].zenexCookies = newCookie; else db.zenexCookies = newCookie;
                    saveDB();
                    const retryData = await getNumber(sel, newCookie);
                    const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                    if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isZenex: true, platform, cookie: newCookie }; continue; }
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
    const { db, pendingRequests, processFoundOTP } = ctx;
    setInterval(async () => {
        const reqs = Object.values(pendingRequests).filter(r => r.isZenex);
        if (reqs.length === 0) return;

        const cookiesToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];
        for (const cookie of cookiesToPoll) {
            try {
                const records = await checkInfo(cookie);

                if (Array.isArray(records)) {
                    records.forEach(rec => {
                        let rawNum      = String(rec.number || "");
                        let cleanRecNum = rawNum.replace(/\D/g, "");
                        if (cleanRecNum) {
                            let pendingKey = Object.keys(pendingRequests).find(
                                k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isZenex && pendingRequests[k].cookie === cookie
                            );
                            if (pendingKey) {
                                let msg = rec.sms;
                                if (msg && typeof msg === "string" && !msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                    processFoundOTP(pendingKey, Date.now(), msg, pendingRequests[pendingKey].country);
                                }
                            }
                        }
                    });
                }
            } catch (e) {}
        }
    }, 2500);
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo, assignNumber, startPolling };
