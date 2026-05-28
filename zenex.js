const https = require("https");

const BASE_URL = "https://zenexnetwork.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function getCookies() {
    return COOKIES;
}

// 🟢 Custom Request Handler (Like MK.js)
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
                    resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text), rawText: text }); 
                } catch { 
                    resolve({ status: res.statusCode, headers: res.headers, data: text, rawText: text }); 
                }
            });
        });

        req.on("error", reject);
        if (body && method === "POST") req.write(body);
        req.end();
    });
}

// 🟢 Login (Handling Cookies properly like mk.js)
async function login(emailOrPhone, password) {
    let tempCookies = "";

    // 1. Visit Login Page to get Initial Cookies
    const getRes = await makeRequest("GET", "/login", null, {}, tempCookies);
    if (getRes.headers && getRes.headers["set-cookie"]) {
        let initialCookies = [];
        getRes.headers["set-cookie"].forEach(c => initialCookies.push(c.split(";")[0]));
        tempCookies = initialCookies.join("; ");
    }

    // Extract CSRF Token if present
    let csrfToken = "";
    if (typeof getRes.rawText === 'string') {
        const tokenMatch = getRes.rawText.match(/<meta name="csrf-token" content="([^"]+)">/);
        if (tokenMatch) csrfToken = tokenMatch[1];
    }

    // 2. Submit Login Request
    const body = JSON.stringify({ emailOrPhone, password });
    const postRes = await makeRequest("POST", "/login", body, {
        "content-type": "application/json",
        "accept": "application/json",
        "x-requested-with": "XMLHttpRequest",
        "x-csrf-token": csrfToken,
        "referer": `${BASE_URL}/login`
    }, tempCookies);

    // Update Cookies
    if (postRes.headers && postRes.headers["set-cookie"]) {
        let extractedCookies = tempCookies ? tempCookies.split("; ") : [];
        postRes.headers["set-cookie"].forEach(c => {
            let cookiePair = c.split(";")[0];
            let cookieName = cookiePair.split("=")[0];
            extractedCookies = extractedCookies.filter(existing => !existing.startsWith(cookieName + "="));
            extractedCookies.push(cookiePair);
        });
        tempCookies = extractedCookies.join("; ");
    }

    // Success Check
    if (postRes.status === 200 || postRes.status === 302 || tempCookies.includes("zenex_session")) {
        COOKIES = tempCookies;
        return tempCookies;
    }

    throw new Error("Login failed. Check credentials or Zenex blocked the request.");
}

// 🟢 Get Number
async function getNumber(range) {
    if (!COOKIES) throw new Error("SESSION_EXPIRED");

    const body = JSON.stringify({ range: range, is_national: false, remove_plus: false });

    try {
        const res = await makeRequest("POST", "/getnum", body, {
            "content-type": "application/json",
            "accept": "application/json",
            "x-requested-with": "XMLHttpRequest",
            "referer": `${BASE_URL}/get-number`
        });

        if (res.status === 401 || res.status === 403 || res.status === 302 || (typeof res.data === 'string' && res.data.includes('login'))) {
            throw new Error("SESSION_EXPIRED");
        }

        if (res.data && res.data.success && res.data.data) {
            return { number: res.data.data.full_number || res.data.data.number };
        }
        
        throw new Error("Out of stock or error");
    } catch (err) {
        if (err.message.includes("Unexpected token") || err.message.includes("JSON")) {
            throw new Error("SESSION_EXPIRED");
        }
        throw err;
    }
}

// 🟢 Check Info (Polling OTPs)
async function checkInfo() {
    if (!COOKIES) return [];

    try {
        const timestamp = Date.now();
        const res = await makeRequest("GET", `/check-otp?t=${timestamp}`, null, {
            "accept": "application/json",
            "x-requested-with": "XMLHttpRequest",
            "referer": `${BASE_URL}/get-number`
        });

        if (res.status === 401 || res.status === 403 || res.status === 302) {
            return []; // Expired, let other functions handle it
        }

        if (res.data && res.data.success && Array.isArray(res.data.otps)) {
            return res.data.otps; // `otps` array direct pass korlam, server.js e eita process hobe
        }
        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo };
