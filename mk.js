const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// মূল HTTP রিকোয়েস্ট ফাংশন (extraHeaders সাপোর্ট সহ আপডেট করা হয়েছে)
function makeRequest(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "*/*",
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

// MK SMS 2-Step Auto Login Function
async function login(email, password) {
    const loginHeaders = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "referer": "https://mknetworkbd.com/index.php",
        "origin": "https://mknetworkbd.com"
    };

    const initialRes = await makeRequest("GET", "/index.php", null, loginHeaders);
    let initialCookies = "";
    if (initialRes.headers["set-cookie"]) {
        initialCookies = initialRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = initialCookies; 
    }

    const body = `login_id=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const loginRes = await makeRequest("POST", "/index.php", body, {
        ...loginHeaders,
        "content-type": "application/x-www-form-urlencoded"
    });
    
    let finalCookiesList = [];
    if (initialCookies) finalCookiesList.push(initialCookies);
    
    if (loginRes.headers["set-cookie"]) {
        loginRes.headers["set-cookie"].forEach(c => {
            const cookiePair = c.split(";")[0];
            const cookieName = cookiePair.split("=")[0];
            finalCookiesList = finalCookiesList.filter(existing => !existing.startsWith(cookieName + "="));
            finalCookiesList.push(cookiePair);
        });
    }

    if (finalCookiesList.length > 0) {
        COOKIES = finalCookiesList.join("; ");
    }
    
    if (loginRes.status === 302 || (loginRes.data && loginRes.data.includes("dashboard"))) {
        return COOKIES;
    }
    
    if (loginRes.data && loginRes.data.includes('name="login_id"')) {
        throw new Error("Login failed. Please check your MK email and password.");
    }

    return COOKIES;
}

// 🟢 MK SMS Get Number API (ব্রাউজারের মতো ঠিকঠাক অরিজিন ও রেফারার হেডার বসানো হয়েছে)
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
    throw new Error((res.data && res.data.message) ? res.data.message : "Failed to get number from MK. Server response: " + JSON.stringify(res.data));
}

// MK SMS Check OTP API
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
