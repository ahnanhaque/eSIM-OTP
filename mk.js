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
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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

// 🟢 MK SMS 2-Step Auto Login Function
async function login(email, password) {
    // ধাপ ১: প্রথমে একটি GET রিকোয়েস্ট পাঠিয়ে প্রাথমিক PHPSESSID সংগ্রহ করা
    const initialRes = await makeRequest("GET", "/index.php");
    let initialCookies = "";
    if (initialRes.headers["set-cookie"]) {
        initialCookies = initialRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
        COOKIES = initialCookies; // মেকরিকোয়েস্টে পাস করার জন্য সাময়িক সেভ
    }

    // ধাপ ২: সংগৃহীত সেশন কুকি ব্যবহার করে ইমেইল ও পাসওয়ার্ড POST করা
    const body = `login_id=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const loginRes = await makeRequest("POST", "/index.php", body, "application/x-www-form-urlencoded");
    
    // নতুন কোনো কুকি (যেমন mk_remember) আসলে তা আগের কুকির সাথে মার্জ করা
    let finalCookiesList = [];
    if (initialCookies) finalCookiesList.push(initialCookies);
    
    if (loginRes.headers["set-cookie"]) {
        loginRes.headers["set-cookie"].forEach(c => {
            const cookiePair = c.split(";")[0];
            const cookieName = cookiePair.split("=")[0];
            // ডুপ্লিকেট রিমুভ ট্র্যাকিং
            finalCookiesList = finalCookiesList.filter(existing => !existing.startsWith(cookieName + "="));
            finalCookiesList.push(cookiePair);
        });
    }

    if (finalCookiesList.length > 0) {
        COOKIES = finalCookiesList.join("; ");
    }
    
    // লগইন সফল হয়েছে কিনা তা যাচাই (রিডাইরেক্ট কোড বা ড্যাশবোর্ড কন্টেন্ট চেক)
    if (loginRes.status === 302 || (loginRes.data && loginRes.data.includes("dashboard"))) {
        return COOKIES;
    }
    
    // যদি পেজে এখনও login_id ইনপুট ফর্ম দেখায়, তার মানে পাসওয়ার্ড ভুল বা লগইন হয়নি
    if (loginRes.data && loginRes.data.includes('name="login_id"')) {
        throw new Error("Login failed. Please check your MK email and password.");
    }

    return COOKIES;
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
