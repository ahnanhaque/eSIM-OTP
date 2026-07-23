const https = require("https");

const BASE_URL = "https://yesms.online";
let COOKIES = "";

function setCookies(cookies) {
COOKIES = cookies;
}

function makeRequest(method, path, body, extraHeaders = {}, customCookies = null) {
return new Promise((resolve, reject) => {
const headers = {
"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8",
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

async function login(email, password) {
const body = new URLSearchParams({
identifier: email,
password: password
}).toString();

const res = await makeRequest("POST", "/login", body, {
    "content-type": "application/x-www-form-urlencoded",
    "referer": "[https://yesms.online/login](https://yesms.online/login)"
});

if (res.status === 303 && res.headers && res.headers["set-cookie"]) {
    let sessionCookie = "";
    res.headers["set-cookie"].forEach(c => {
        let cookiePair = c.split(";")[0];
        if (cookiePair.startsWith("session=")) {
            sessionCookie = cookiePair;
        }
    });
    
    if (sessionCookie) {
        return sessionCookie; 
    }
}

throw new Error("Login failed. Please check your email and password.");
}

async function verifyCookies(cookieStr) {
const oldCookies = COOKIES;
COOKIES = cookieStr;
try {
const res = await makeRequest("GET", "/dashboard");
if (res.status === 302 || res.status === 303 || (res.headers && res.headers.location && res.headers.location.includes("login")) || (typeof res.data === 'string' && res.data.includes('name="identifier"'))) {
COOKIES = oldCookies;
throw new Error("SESSION_EXPIRED");
}
return true;
} catch (err) {
COOKIES = oldCookies;
throw err;
}
}

async function getNumber(range, customCookie = null) {
const body = JSON.stringify({
range_id: range
});

const res = await makeRequest("POST", "/api/allocate_number", body, {
    "accept": "application/json",
    "content-type": "application/json",
    "referer": "[https://yesms.online/dashboard](https://yesms.online/dashboard)",
    "origin": "[https://yesms.online](https://yesms.online)"
}, customCookie);

if (res.status === 302 || res.status === 303 || (res.headers && res.headers.location && res.headers.location.includes("login"))) {
    throw new Error("SESSION_EXPIRED");
}
if (res.data && res.data.success && res.data.data && res.data.data.full_number) {
    return {
        number: res.data.data.full_number
    };
}
throw new Error("SESSION_EXPIRED");
}

async function checkInfo(date, customCookie = null) {
const res = await makeRequest("GET", "/api/user_numbers", null, {
"accept": "application/json",
"referer": "https://yesms.online/dashboard"
}, customCookie);

if (res.status === 302 || res.status === 303 || (res.headers && res.headers.location && res.headers.location.includes("login"))) {
    throw new Error("SESSION_EXPIRED");
}

if (res.data && res.data.numbers && Array.isArray(res.data.numbers)) {
    return res.data.numbers.map(item => ({
        full_number: item.full_number,
        status: item.status,
        message: item.message,
        otp_code: item.otp_code
    }));
}

return [];
}

async function getLiveConsole(customCookie = null) {
return null;
}

module.exports = { setCookies, verifyCookies, getNumber, checkInfo, login, getLiveConsole };
