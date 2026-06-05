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

function startPolling(ctx) {
    const { db, pendingRequests, processFoundOTP } = ctx;
    let isPolling = false; // 🟢 Async overlap lock

    setInterval(async () => {
        if (isPolling) return;

        const reqs = Object.values(pendingRequests).filter(r => r.isStex);
        if (reqs.length === 0) return;

        isPolling = true;
        try {
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
        } finally {
            isPolling = false; // Lock released
        }
    }, 2500);
}

module.exports = { login, setAuthToken, getNumber, checkInfo, startPolling };
