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

// 🟢 NXA Login
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

// 🟢 Request a Number
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
        if (err.message.includes("Unexpected token") || err.message.includes("SESSION_EXPIRED")) throw new Error("SESSION_EXPIRED");
        throw err;
    }
}

// 🟢 Check Info (Polling History Data - Limit changed to 100)
async function checkInfo(token, cookie, dateStr) {
    if (!token) return [];
    let path = "/api/user/history?page=1&status=&limit=100";
    if (dateStr) path += `&date=${dateStr}`;

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

function startPolling(ctx) {
    const { db, pendingRequests, processFoundOTP } = ctx;
    let isPolling = false; // 🟢 Async overlap lock

    setInterval(async () => {
        if (isPolling) return;

        const reqs = Object.values(pendingRequests).filter(r => r.isNxa);
        if (reqs.length === 0) return;

        isPolling = true;
        try {
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
        } finally {
            isPolling = false; // Lock released
        }
    }, 2500);
}

module.exports = { login, setAuthData, getNumber, checkInfo, startPolling };
