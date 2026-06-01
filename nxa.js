const http = require("http");

const BASE_URL = "http://63.141.255.227";
let SESSION_TOKEN = "";
let COOKIES = "";

function setAuthData(token, cookies) {
    SESSION_TOKEN = token;
    COOKIES = cookies;
}

function makeRequest(method, path, body, extraHeaders = {}, customToken = null, customCookies = null) {
    return new Promise((resolve, reject) => {
        const token = customToken !== null ? customToken : SESSION_TOKEN;
        const cookie = customCookies !== null ? customCookies : COOKIES;

        const headers = {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "Origin": BASE_URL,
            "Referer": `${BASE_URL}/app/login`,
            ...extraHeaders
        };

        if (token) headers["X-Session-Token"] = token;
        if (cookie) headers["Cookie"] = cookie;

        if (body && method !== "GET") {
            headers["Content-Length"] = Buffer.byteLength(body);
        }

        const req = http.request(BASE_URL + path, { method, headers }, res => {
            let chunks = [];
            res.on("data", d => chunks.push(d));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf-8");
                try {
                    resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text), rawText: text });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, data: text, rawText: text });
                }
            });
        });

        req.on("error", reject);
        if (body && method !== "GET") req.write(body);
        req.end();
    });
}

// 🟢 Login System
async function login(email, password) {
    const body = JSON.stringify({ email, password });
    const res = await makeRequest("POST", "/api/auth/login", body);

    let newCookie = "";
    if (res.headers && res.headers["set-cookie"]) {
        newCookie = res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
    }

    if (res.data) {
        let token = res.data.session_token || res.data.token || (res.data.data && res.data.data.token);
        if (token) {
            SESSION_TOKEN = token;
            if (newCookie) COOKIES = newCookie;
            return { token: token, cookie: newCookie || COOKIES };
        }
    }
    
    throw new Error((res.data && res.data.message) ? res.data.message : "NXA Login Failed! Check credentials.");
}

// 🟢 Get Number
async function getNumber(range, token, cookie) {
    if (!token) throw new Error("SESSION_EXPIRED");

    const body = JSON.stringify({ range: range, format: "normal" });

    try {
        const res = await makeRequest("POST", "/api/user/request-number", body, {}, token, cookie);

        if (res.status === 401 || res.status === 403) throw new Error("SESSION_EXPIRED");

        if (res.data && res.data.success && res.data.number_raw) {
            return { 
                number: res.data.number_raw.replace("+", ""),
                internal_id: res.data.internal_id 
            };
        }
        
        throw new Error((res.data && res.data.message) ? res.data.message : "Out of stock or error in NXA");
    } catch (err) {
        if (err.message.includes("Unexpected token") || err.message.includes("SESSION_EXPIRED")) {
            throw new Error("SESSION_EXPIRED");
        }
        throw err;
    }
}

// 🟢 Check Info (Polling History Data)
async function checkInfo(token, cookie, dateStr) {
    if (!token) return [];

    let path = "/api/user/history?page=1&status=&limit=50";
    if (dateStr) {
        path += `&date=${dateStr}`;
    }

    try {
        const extraHeaders = {
            "Accept-Language": "en-US,en;q=0.9,es-US;q=0.8,es;q=0.7",
            "Referer": `${BASE_URL}/app/getnum`
        };

        const res = await makeRequest("GET", path, null, extraHeaders, token, cookie);

        if (res.status === 401 || res.status === 403) return [];

        if (res.data) {
            if (res.data.data && Array.isArray(res.data.data)) return res.data.data;
            if (Array.isArray(res.data)) return res.data;
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
    let isUserNxa = db.settings.userPanelAccess && userP.nxaToken;
    const tokenToUse = isUserNxa ? userP.nxaToken : db.nxaToken;
    const cookieToUse = isUserNxa ? userP.nxaCookies : db.nxaCookies;
    const credsToUse = isUserNxa ? userP.nxaCreds : db.nxaCreds;

    for (let i = 0; i < limit; i++) {
        try {
            const numData = await getNumber(sel, tokenToUse, cookieToUse);
            const n = numData.number ? numData.number.replace("+", "") : "";
            if (n) {
                fetchedNums.push(n);
                inUseNumbers[n]    = true;
                pendingRequests[n] = { chatId, country: countryName, isNxa: true, platform, token: tokenToUse, cookie: cookieToUse, internal_id: numData.internal_id };
            }
        } catch (e) {
            if (i === 0 && credsToUse?.email) {
                try {
                    const authData = await login(credsToUse.email, credsToUse.password);
                    if (isUserNxa) { db.userPanels[chatId].nxaToken = authData.token; db.userPanels[chatId].nxaCookies = authData.cookie; } 
                    else { db.nxaToken = authData.token; db.nxaCookies = authData.cookie; }
                    saveDB();
                    const retryData = await getNumber(sel, authData.token, authData.cookie);
                    const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                    if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isNxa: true, platform, token: authData.token, cookie: authData.cookie, internal_id: retryData.internal_id }; continue; }
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
        const reqs = Object.values(pendingRequests).filter(r => r.isNxa);
        if (reqs.length === 0) return;

        const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
        d.setHours(d.getHours() - 6); 
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const authKeys = [...new Set(reqs.map(r => `${r.token}|${r.cookie}`))];
        for (const authStr of authKeys) {
            const [token, cookie] = authStr.split("|");
            try {
                const response = await checkInfo(token, cookie, dateStr);
                const records = Array.isArray(response) ? response : (response?.data || []);

                if (Array.isArray(records)) {
                    records.forEach(rec => {
                        if (rec.allocated_at && !rec.allocated_at.startsWith(dateStr)) return;

                        let pendingKey = Object.keys(pendingRequests).find(k => 
                            pendingRequests[k].isNxa && 
                            pendingRequests[k].token === token &&
                            pendingRequests[k].internal_id === rec.internal_id
                        );

                        if (!pendingKey) {
                            let rawNum = String(rec.number || "");
                            let cleanRecNum = rawNum.replace(/\D/g, "");
                            if (cleanRecNum) {
                                pendingKey = Object.keys(pendingRequests).find(k => 
                                    k.replace(/\D/g, "") === cleanRecNum && 
                                    pendingRequests[k].isNxa && 
                                    pendingRequests[k].token === token
                                );
                            }
                        }

                        if (pendingKey) {
                            let status = String(rec.status || "").toLowerCase();
                            let msg = rec.message || rec.otp;

                            if (status === "success" && msg && typeof msg === "string") {
                                if (!msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
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

module.exports = { login, setAuthData, getNumber, checkInfo, assignNumber, startPolling };
