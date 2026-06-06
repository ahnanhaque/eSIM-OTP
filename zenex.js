const https = require("https");

const BASE_URL = "https://www.zenexnetwork.com";

function makeRequest(method, path, body, apiKey = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "application/json",
            "mapikey": apiKey || "",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        };

        if (body && method === "POST") {
            headers["content-type"] = "application/json";
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
        if (body && method === "POST") req.write(body);
        req.end();
    });
}

async function login(email, password) {
    const apiKey = password || email; 
    const res = await makeRequest("GET", "/api/v1/numsuccess/info", null, apiKey);
    
    if (res.status === 200 && res.data && res.data.meta && res.data.meta.status === "success") {
        return apiKey;
    }
    throw new Error("Invalid Zenex API Key! Please check your key.");
}

async function getNumber(range, apiKey = null) {
    if (!apiKey) throw new Error("SESSION_EXPIRED");
    const body = JSON.stringify({ range: range, is_national: false, remove_plus: false });

    try {
        const res = await makeRequest("POST", "/api/v1/getnum", body, apiKey);
        if (res.status === 401 || res.status === 403) throw new Error("SESSION_EXPIRED");

        if (res.data && res.data.meta && res.data.meta.status === "success" && res.data.data) {
            return { number: res.data.data.full_number || res.data.data.number };
        }
        throw new Error((res.data && res.data.message) ? res.data.message : "Out of stock or error in Zenex");
    } catch (err) {
        throw err;
    }
}

async function checkInfo(apiKey = null) {
    if (!apiKey) return [];
    try {
        const res = await makeRequest("GET", "/api/v1/numsuccess/info", null, apiKey);
        if (res.status === 401 || res.status === 403) return []; 

        if (res.data && res.data.data && Array.isArray(res.data.data.otps)) {
            return res.data.data.otps.map(item => ({ number: item.number, sms: item.otp }));
        }
        return [];
    } catch (e) {
        return [];
    }
}

async function getLiveTraffic(apiKey = null) {
    if (!apiKey) return [];
    try {
        const res = await makeRequest("GET", "/api/v1/active-ranges", null, apiKey);
        if (res.status === 401 || res.status === 403) return [];
        if (res.data && res.data.success && res.data.data && Array.isArray(res.data.data.active_ranges)) {
            return res.data.data.active_ranges;
        }
        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { login, getNumber, checkInfo, getLiveTraffic };
