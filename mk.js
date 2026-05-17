const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// 🟢 Auto Cookie Tracker function
function getCookies() {
    return COOKIES;
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
            // 🟢 Auto Cookie Saver Logic: Server notun cookie dile auto update korbe
            if (res.headers["set-cookie"]) {
                let currentCookies = COOKIES ? COOKIES.split("; ") : [];
                res.headers["set-cookie"].forEach(c => {
                    let cookiePair = c.split(";")[0];
                    let cookieName = cookiePair.split("=")[0];
                    currentCookies = currentCookies.filter(existing => !existing.startsWith(cookieName + "="));
                    currentCookies.push(cookiePair);
                });
                COOKIES = currentCookies.join("; ");
            }

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

async function verifyCookies(cookieStr) {
    const oldCookies = COOKIES;
    COOKIES = cookieStr;
    try {
        const res = await makeRequest("GET", "/getnum_test.php");
        if (res.status === 302 || (res.data && typeof res.data === 'string' && res.data.includes('name="login_id"'))) {
            COOKIES = oldCookies;
            throw new Error("Invalid or Expired Cookies! Please copy fresh PHPSESSID and mk_remember.");
        }
        if (res.data && typeof res.data === 'string' && !res.data.includes('get_number')) {
            COOKIES = oldCookies;
            throw new Error("Dashboard load failed. Please ensure your account is active.");
        }
        return true; 
    } catch (err) {
        COOKIES = oldCookies;
        throw err;
    }
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

module.exports = { setCookies, getCookies, verifyCookies, getNumber, checkInfo };
