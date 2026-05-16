const https = require("https");

const BASE_URL = "https://stexsms.com";
let AUTH_TOKEN = "";

function setAuthToken(token) { 
    AUTH_TOKEN = token; 
}

function makeRequest(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            ...extraHeaders
        };
        
        if (AUTH_TOKEN) {
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
        AUTH_TOKEN = res.data.data.token;
        return AUTH_TOKEN;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Login failed");
}

// Stex Get Number API
async function getNumber(range) {
    const res = await makeRequest("POST", "/mapi/v1/mdashboard/getnum/number", JSON.stringify({ range, is_national: false, remove_plus: false }));
    if (res.data && res.data.data && res.data.data.full_number) {
        return res.data.data;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Failed to get number from Stex.");
}

// Stex Check OTP info API
async function checkInfo(date) {
    const res = await makeRequest("GET", `/mapi/v1/mdashboard/getnum/info?date=${date}&page=1&search=&status=`);
    // JSON response অনুযায়ী ডাটা রিটার্ন
    if (res.data && res.data.data && res.data.data.numbers) {
        return res.data.data.numbers; 
    }
    return [];
}

module.exports = { login, setAuthToken, getNumber, checkInfo };
