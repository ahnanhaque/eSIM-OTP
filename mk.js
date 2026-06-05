const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function makeRequest(method, path, body, extraHeaders = {}, customCookies = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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

// MK SMS Login
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

// MK Get Number API
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

// MK Check OTP info API (Limit changed to 100)
async function checkInfo(date, customCookie = null) {
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=get_history&filter=all&page=1&limit=100&date=${date}`, null, {
        "accept": "*/*",
        "referer": "https://mknetworkbd.com/getnum_test.php"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) {
        return [];
    }
    if (res.data && res.data.status === "success" && res.data.history) {
        return res.data.history;
    }
    return [];
}

function startPolling(ctx) {
    const { db, pendingRequests, processFoundOTP } = ctx;
    let isPolling = false; // 🟢 Async overlap lock

    setInterval(async () => {
        if (isPolling) return;

        const reqs = Object.values(pendingRequests).filter(r => r.isMk);
        if (reqs.length === 0) return;

        isPolling = true; // Lock activated
        try {
            const cookiesToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];

            for (const cookie of cookiesToPoll) {
                try {
                    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
                    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const records = await checkInfo(dateStr, cookie);

                    if (Array.isArray(records)) {
                        records.forEach(rec => {
                            let rawNum      = String(rec.phone_number || rec.number || "");
                            let cleanRecNum = rawNum.replace(/\D/g, "");
                            if (cleanRecNum) {
                                let pendingKey = Object.keys(pendingRequests).find(
                                    k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isMk && pendingRequests[k].cookie === cookie
                                );
                                if (pendingKey) {
                                    let msg = rec.full_sms_list || rec.sms || rec.otps || rec.message || rec.text;
                                    if (msg && typeof msg === "string" && !msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
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

module.exports = { login, setCookies, getNumber, checkInfo, startPolling };
