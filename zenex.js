const https = require("https");

const BASE_URL = "https://api.zenexnetwork.com";

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

    const res = await makeRequest(
        "GET",
        "/v1/numsuccess/info",
        null,
        apiKey
    );

    console.log("ZENEX LOGIN STATUS:", res.status);
    console.log("ZENEX LOGIN RESPONSE:", JSON.stringify(res.data, null, 2));

    if (
        res.status === 200 &&
        res.data &&
        res.data.meta &&
        res.data.meta.status === "success"
    ) {
        return apiKey;
    }

    throw new Error("Invalid Zenex API Key! Please check your key.");
}

async function getNumber(range, apiKey = null) {
    if (!apiKey) throw new Error("SESSION_EXPIRED");

    const body = JSON.stringify({ range: range, is_national: false, remove_plus: false });

    try {
      const res = await makeRequest(
    "POST",
    "/v1/getnum",
    body,
    apiKey
);

        if (res.status === 401 || res.status === 403) {
            throw new Error("SESSION_EXPIRED");
        }

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
        const res = await makeRequest(
    "GET",
    "/v1/numsuccess/info",
    null,
    apiKey
);

        if (res.status === 401 || res.status === 403) {
            return []; 
        }

        if (res.data && res.data.data && Array.isArray(res.data.data.otps)) {
            return res.data.data.otps.map(item => ({
                number: item.number,
                sms: item.otp 
            }));
        }
        return [];
    } catch (e) {
        return [];
    }
}

function startPolling(ctx) {
    const { db, pendingRequests, processFoundOTP } = ctx;
    let isPolling = false;

    setInterval(async () => {
        if (isPolling) return;

        const reqs = Object.values(pendingRequests).filter(r => r.isZenex);
        if (reqs.length === 0) return;

        isPolling = true;
        try {
            const apiKeysToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];
            
            for (const apiKey of apiKeysToPoll) {
                try {
                    const records = await checkInfo(apiKey);

                    if (Array.isArray(records)) {
                        records.forEach(rec => {
                            let rawNum      = String(rec.number || "");
                            let cleanRecNum = rawNum.replace(/\D/g, "");
                            
                            if (cleanRecNum) {
                                let pendingKey = Object.keys(pendingRequests).find(
                                    k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isZenex && pendingRequests[k].cookie === apiKey
                                );
                                
                                if (pendingKey) {
                                    let msg = rec.sms;
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
            isPolling = false;
        }
    }, 3500);
}
async function getLiveTraffic(apiKey = null) {
    if (!apiKey) return [];

    try {
        const res = await makeRequest(
            "GET",
            "/v1/active-ranges",
            null,
            apiKey
        );

        if (
            res.status === 200 &&
            res.data &&
            res.data.data &&
            Array.isArray(res.data.data.active_ranges)
        ) {
            return res.data.data.active_ranges;
        }

        return [];
    } catch (e) {
        return [];
    }
}
module.exports = { login, getNumber, checkInfo, startPolling, getLiveTraffic };
