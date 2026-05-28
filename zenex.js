const https = require("https");

const BASE_URL = "https://zenexnetwork.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function getCookies() {
    return COOKIES;
}

// 🟢 Custom Request Handler with strict Browser Headers
function makeRequest(method, path, body, extraHeaders = {}, customCookies = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "origin": BASE_URL,
            "referer": `${BASE_URL}/login`,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
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

// 🟢 Login
async function login(emailOrPhone, password) {
    let tempCookies = "";
    const body = JSON.stringify({ emailOrPhone, password });

    const postRes = await makeRequest("POST", "/api/login", body, {
        "content-type": "application/json"
    }, tempCookies);

    if (postRes.headers && postRes.headers["set-cookie"]) {
        let extractedCookies = [];
        postRes.headers["set-cookie"].forEach(c => {
            extractedCookies.push(c.split(";")[0]);
        });
        tempCookies = extractedCookies.join("; ");
    }

    if (postRes.status === 200 || postRes.status === 201) {
        COOKIES = tempCookies;
        return tempCookies;
    }

    throw new Error(`Login failed! Server returned ${postRes.status}. Check credentials.`);
}

// 🟢 Get Number (Perfectly imitates clicking "Get Number" on the website)
async function getNumber(range) {
    if (!COOKIES) throw new Error("SESSION_EXPIRED");

    const body = JSON.stringify({ range: range, is_national: false, remove_plus: false });

    try {
        const res = await makeRequest("POST", "/api/getnum", body, {
            "content-type": "application/json",
            "referer": `${BASE_URL}/get-number`,
            "priority": "u=1, i"
        });

        if (res.status === 401 || res.status === 403 || res.status === 302 || (typeof res.data === 'string' && res.data.includes('login'))) {
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

// 🟢 Check Info (Polling OTPs)
async function checkInfo() {
    if (!COOKIES) return [];

    try {
        const timestamp = Date.now();
        const res = await makeRequest("GET", `/api/check-otp?t=${timestamp}`, null, {
            "referer": `${BASE_URL}/get-number`
        });

        if (res.status === 401 || res.status === 403 || res.status === 302) {
            return []; 
        }

        if (res.data && res.data.success && Array.isArray(res.data.otps)) {
            return res.data.otps;
        }
        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo };
