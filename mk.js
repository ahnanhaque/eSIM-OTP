const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

function makeRequest(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "cookie": COOKIES || "",
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

// 🟢 MK SMS Email/Password Auto Login Logic (Redirect Following)
async function login(email, password) {
    // Step 1: Initial GET for PHPSESSID
    const initialRes = await makeRequest("GET", "/index.php");
    if (initialRes.headers["set-cookie"]) {
        COOKIES = initialRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
    }

    // Step 2: POST Login data to index.php
    const body = `login_id=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    await makeRequest("POST", "/index.php", body, {
        "content-type": "application/x-www-form-urlencoded",
        "referer": "https://mknetworkbd.com/index.php"
    });

    // Step 3: Follow Redirect to auth.php (Where actual verification happens)
    const authRes = await makeRequest("GET", "/auth.php", null, {
        "referer": "https://mknetworkbd.com/index.php"
    });

    // Extract real cookies (like mk_remember) from auth.php
    if (authRes.headers["set-cookie"]) {
        authRes.headers["set-cookie"].forEach(c => {
            const cookiePair = c.split(";")[0];
            const cookieName = cookiePair.split("=")[0];
            let currentCookies = COOKIES ? COOKIES.split("; ") : [];
            currentCookies = currentCookies.filter(existing => !existing.startsWith(cookieName + "="));
            currentCookies.push(cookiePair);
            COOKIES = currentCookies.join("; ");
        });
    }

    // Check if auth.php rejected the login and sent us back to index.php
    if (authRes.status === 302 && authRes.headers["location"] && authRes.headers["location"].includes("index.php")) {
        throw new Error("Incorrect Email or Password!");
    }

    // Step 4: Final Dashboard Verification
    const verifyRes = await makeRequest("GET", "/getnum_test.php");
    if (verifyRes.status === 302 || (typeof verifyRes.data === 'string' && verifyRes.data.includes('name="login_id"'))) {
        throw new Error("Incorrect Email or Password!");
    }

    return COOKIES;
}

async function getNumber(range) {
    const boundary = "----WebKitFormBoundaryd1BBMabQSSbA47sv";
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
    });
    
    if (res.data && res.data.status === "success" && res.data.number) {
        return res.data;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Session Expired or Out of Stock.");
}

async function checkInfo(date) {
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=get_history&filter=all&page=1&limit=15&date=${date}`, null, {
        "accept": "*/*",
        "referer": "https://mknetworkbd.com/getnum_test.php"
    });
    if (res.data && res.data.status === "success" && res.data.data) {
        return res.data.data; 
    }
    return [];
}

module.exports = { login, setCookies, getNumber, checkInfo };
