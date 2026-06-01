const https = require("https");

const BASE_URL = "https://stexsms.com";
let AUTH_TOKEN = "";

function setAuthToken(token) { 
    AUTH_TOKEN = token; 
}

function makeRequest(method, path, body, extraHeaders = {}, customToken = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            ...extraHeaders
        };
        
        if (customToken) {
            headers["mauthtoken"] = customToken;
        } else if (AUTH_TOKEN) {
            headers["mauthtoken"] = AUTH_TOKEN;
        }

        if (body && method !== "GET") {
            headers["content-length"] = Buffer.byteLength(body);
        }

        const req = https.request(BASE_URL + path, { method, headers }, res => {
            let chunks = [];
            res.on("data", d => chunks.push(d));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf-8");
                try { 
                    resolve({ status: res.statusCode, data: JSON.parse(text) }); 
                } catch { 
                    resolve({ status: res.statusCode, data: text }); 
                }
            });
        });

        req.on("error", reject);
        if (body && method !== "GET") req.write(body);
        req.end();
    });
}

// Stex SMS Login
async function login(email, password) {
    const res = await makeRequest("POST", "/mapi/v1/mauth/login", JSON.stringify({ email, password }));
    if (res.data && res.data.data && res.data.data.token) {
        return res.data.data.token;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Login failed");
}

// Stex Get Number API
async function getNumber(range, customToken = null) {
    const res = await makeRequest("POST", "/mapi/v1/mdashboard/getnum/number", JSON.stringify({ range, is_national: false, remove_plus: false }), {}, customToken);
    if (res.data && res.data.data && res.data.data.full_number) {
        return res.data.data;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Failed to get number from Stex.");
}

// Stex Check OTP info API
async function checkInfo(date, customToken = null) {
    const res = await makeRequest("GET", `/mapi/v1/mdashboard/getnum/info?date=${date}&page=1&search=&status=`, null, {}, customToken);
    if (res.data && res.data.data && res.data.data.numbers) {
        return res.data.data.numbers; 
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
    let isUserStex = db.settings.userPanelAccess && userP.stexToken;
    const tokenToUse  = isUserStex ? userP.stexToken : db.stexToken;
    const credsToUse  = isUserStex ? userP.stexCreds : db.stexCreds;

    for (let i = 0; i < limit; i++) {
        try {
            const numData = await getNumber(sel, tokenToUse);
            const n = numData.full_number || numData.number.replace("+", "");
            if (n) {
                fetchedNums.push(n);
                inUseNumbers[n]    = true;
                pendingRequests[n] = { chatId, country: countryName, isStex: true, platform, token: tokenToUse };
            }
        } catch (e) {
            if (i === 0 && credsToUse?.email) {
                try {
                    const newToken = await login(credsToUse.email, credsToUse.password);
                    if (isUserStex) db.userPanels[chatId].stexToken = newToken; else db.stexToken = newToken;
                    saveDB();
                    const retryData = await getNumber(sel, newToken);
                    const retryN    = retryData.full_number || retryData.number.replace("+", "");
                    if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isStex: true, platform, token: newToken }; continue; }
                } catch (err2) { break; }
            }
            break;
        }
    }

    if (fetchedNums.length === 0) {
        bot.editMessageText(`❌ Out of stock or error fetching the number.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }).catch(() => {});
        return;
    }

    const info     = getCountryInfo(countryName);
    let platName   = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
    let replyText  = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
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
        const reqs = Object.values(pendingRequests).filter(r => r.isStex);
        if (reqs.length === 0) return;

        const tokensToPoll = [...new Set(reqs.map(r => r.token).filter(Boolean))];
        for (const token of tokensToPoll) {
            try {
                const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
                d.setHours(d.getHours() - 4);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

                const records = await checkInfo(dateStr, token);
                if (Array.isArray(records)) {
                    records.forEach(rec => {
                        let num = rec.number ? String(rec.number).replace("+", "") : null;
                        if (num && pendingRequests[num] && pendingRequests[num].token === token) {
                            let status = String(rec.status || "").toLowerCase();
                            let msg    = rec.sms || rec.message || rec.otp || rec.text;
                            if ((status === "success" || status === "completed" || msg) && msg) {
                                msg = String(msg);
                                if (!msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                    processFoundOTP(num, Date.now(), msg, pendingRequests[num].country);
                                }
                            }
                        }
                    });
                }
            } catch (e) {}
        }
    }, 2500);
}

module.exports = { login, setAuthToken, getNumber, checkInfo, assignNumber, startPolling };
