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
            if (!headers["content-type"]) headers["content-type"] = "application/json";
            headers["content-length"] = Buffer.byteLength(body);
        }

        const req = https.request(BASE_URL + path, { method, headers }, res => {
            let chunks = [];
            res.on("data", d => chunks.push(d));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf-8");
                try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }); } 
                catch { resolve({ status: res.statusCode, headers: res.headers, data: text }); }
            });
        });

        req.on("error", reject);
        if (body && method === "POST") req.write(body);
        req.end();
    });
}

async function login(email, password) {
    let tempCookies = ""; 
    const getRes = await makeRequest("GET", "/login.php", null, {}, tempCookies);
    if (getRes.headers && getRes.headers["set-cookie"]) {
        let initialCookies = [];
        getRes.headers["set-cookie"].forEach(c => initialCookies.push(c.split(";")[0]));
        tempCookies = initialCookies.join("; ");
    }

    const body = new URLSearchParams({ login_id: email, password: password }).toString();
    const res = await makeRequest("POST", "/login.php", body, {
        "content-type": "application/x-www-form-urlencoded",
        "referer": "https://mknetworkbd.com/login.php"
    }, tempCookies);

    if (res.headers && res.headers["set-cookie"]) {
        let extractedCookies = tempCookies ? tempCookies.split("; ") : [];
        res.headers["set-cookie"].forEach(c => {
            let cookiePair = c.split(";")[0];
            let cookieName = cookiePair.split("=")[0];
            extractedCookies = extractedCookies.filter(existing => !existing.startsWith(cookieName + "="));
            extractedCookies.push(cookiePair);
        });
        tempCookies = extractedCookies.join("; ");
    }
    
    if (res.status === 302 || tempCookies.includes("mk_remember") || (res.headers && res.headers.location)) {
        return tempCookies; 
    }
    throw new Error("Login failed. Please check your email and password.");
}

async function getNumber(range, customCookie = null) {
    const boundary = "----WebKitFormBoundaryd1BBMabQSSbA47sv";
    const body = [
        `--${boundary}`, `Content-Disposition: form-data; name="action"`, ``, `get_number`,
        `--${boundary}`, `Content-Disposition: form-data; name="range"`, ``, `${range}`,
        `--${boundary}--`, ``
    ].join("\r\n");

    const res = await makeRequest("POST", "/API/api_handler_test.php", body, {
        "accept": "*/*",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "referer": "https://mknetworkbd.com/getnum_test.php",
        "origin": "https://mknetworkbd.com"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) throw new Error("SESSION_EXPIRED");
    if (res.data && res.data.status === "success" && res.data.number) return res.data;
    throw new Error((res.data && res.data.message) ? res.data.message : "SESSION_EXPIRED");
}

async function checkInfo(date, customCookie = null) {
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=get_history&filter=all&page=1&limit=15&date=${date}`, null, {
        "accept": "*/*", "referer": "https://mknetworkbd.com/getnum_test.php"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) throw new Error("SESSION_EXPIRED");
    if (res.data && res.data.status === "success" && res.data.data) return res.data.data; 
    return [];
}

async function getLiveConsole(customCookie = null) {
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=get_history&filter=all&page=1&limit=20`, null, {
        "accept": "*/*", "referer": "https://mknetworkbd.com/"
    }, customCookie);
    
    if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) return [];
    if (res.data && res.data.status === "success" && res.data.data) return res.data.data; 
    return [];
}

module.exports = { setCookies, getNumber, checkInfo, login, getLiveConsole };
