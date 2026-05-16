const https = require("https");

const BASE_URL = "https://mknetworkbd.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// মূল HTTP রিকোয়েস্ট ফাংশন
function makeRequest(method, path, body, contentType = "application/json") {
    return new Promise((resolve, reject) => {
        const headers = {
            "accept": "*/*",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "cookie": COOKIES || ""
        };

        if (body && method === "POST") {
            headers["content-type"] = contentType;
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

// 🟢 MK SMS Auto Login Function (কুকি স্ক্র্যাপ করবে)
async function login(email, password) {
    const body = `login_id=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    
    const res = await makeRequest("POST", "/index.php", body, "application/x-www-form-urlencoded");
    
    const setCookie = res.headers["set-cookie"];
    if (setCookie && setCookie.length > 0) {
        const cookieStr = setCookie.map(c => c.split(";")[0]).join("; ");
        COOKIES = cookieStr;
        return COOKIES;
    }
    
    // যদি কোনো কারণে সফল লগইনেও রিডাইরেক্ট কুকি না আসে, তবে রেসপন্স চেক
    if (res.data && res.data.includes("dashboard")) {
        return COOKIES;
    }
    
    throw new Error("Login failed. Please check your MK email and password.");
}

// MK SMS Get Number API
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

    const res = await makeRequest("POST", "/API/api_handler_test.php", body, `multipart/form-data; boundary=${boundary}`);
    if (res.data && res.data.status === "success" && res.data.number) {
        return res.data;
    }
    throw new Error((res.data && res.data.message) ? res.data.message : "Failed to get number from MK.");
}

// MK SMS Check OTP API
async function checkInfo(date) {
    const res = await makeRequest("GET", `/API/api_handler_test.php?action=get_history&filter=all&page=1&limit=15&date=${date}`);
    if (res.data && res.data.status === "success" && res.data.data) {
        return res.data.data; 
    }
    return [];
}

module.exports = { login, setCookies, getNumber, checkInfo };
