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

// 🟢 MK SMS Perfect Auto Login Logic (Strict Redirect & State Tracking)
async function login(email, password) {
    // ধাপ ১: সেশন ইনিশিয়ালের জন্য GET রিকোয়েস্ট
    const initialRes = await makeRequest("GET", "/index.php");
    if (initialRes.headers["set-cookie"]) {
        COOKIES = initialRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
    }

    // ধাপ ২: index.php-তে credentials সাবমিট করা
    const body = `login_id=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const loginRes = await makeRequest("POST", "/index.php", body, {
        "content-type": "application/x-www-form-urlencoded",
        "referer": "https://mknetworkbd.com/index.php",
        "origin": "https://mknetworkbd.com"
    });

    // নতুন কোনো সেশন কুকি বা রিমেম্বার টোকেন আসলে তা মার্জ করা
    if (loginRes.headers["set-cookie"]) {
        let freshCookies = loginRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = COOKIES ? COOKIES + "; " + freshCookies : freshCookies;
    }

    // ধাপ ৩: auth.php পেজে হিট করে সেশন অ্যাক্টিভেট করা
    const authRes = await makeRequest("GET", "/auth.php", null, {
        "referer": "https://mknetworkbd.com/index.php"
    });

    if (authRes.headers["set-cookie"]) {
        let authCookies = authRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = COOKIES ? COOKIES + "; " + authCookies : authCookies;
    }

    // ধাপ ৪: ড্যাশবোর্ড পেজ হিট করে লগইন স্টেট কনফার্ম করা
    const verifyRes = await makeRequest("GET", "/getnum_test.php", null, {
        "referer": "https://mknetworkbd.com/auth.php"
    });

    // যদি পেজে এখনও login_id ফর্ম বা 'login' শব্দ থাকে, তার মানে লগইন হয়নি (ভুল credentials)
    if (verifyRes.status === 302 || (typeof verifyRes.data === 'string' && verifyRes.data.includes('name="login_id"'))) {
        throw new Error("Incorrect Email or Password! Login failed.");
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
