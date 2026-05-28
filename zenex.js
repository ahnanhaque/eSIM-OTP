let currentCookies = "";
const BASE_URL = "https://zenexnetwork.com";

function setCookies(cookies) {
    currentCookies = cookies;
}

function getCookies() {
    return currentCookies;
}

// 🟢 Login
async function login(emailOrPhone, password) {
    try {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({ emailOrPhone, password })
        });

        const cookieHeader = res.headers.get('set-cookie');
        if (cookieHeader) {
            currentCookies = cookieHeader.split(';')[0]; // সাধারণ সেশন কুকি সেভ করা
        }

        if (!res.ok) {
            throw new Error("Login failed! Check credentials.");
        }
        return currentCookies;
    } catch (error) {
        throw error;
    }
}

// 🟢 Get Number
async function getNumber(range) {
    if (!currentCookies) throw new Error("SESSION_EXPIRED");

    try {
        const res = await fetch(`${BASE_URL}/getnum`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': currentCookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({ range: range, is_national: false, remove_plus: false })
        });

        const data = await res.json();

        if (data.success && data.data) {
            return { number: data.data.full_number || data.data.number };
        } else {
            throw new Error("Out of stock or error");
        }
    } catch (error) {
        if (error.message.includes("Unexpected token") || error.message.includes("JSON")) {
            throw new Error("SESSION_EXPIRED"); // সেশন এক্সপায়ার হলে অনেক সময় HTML লগইন পেজ দেয়
        }
        throw error;
    }
}

// 🟢 Check OTPs
async function checkInfo() {
    if (!currentCookies) return [];
    try {
        const timestamp = Date.now();
        const res = await fetch(`${BASE_URL}/check-otp?t=${timestamp}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': currentCookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const data = await res.json();
        
        if (data.success && Array.isArray(data.otps)) {
            return data.otps.map(item => ({
                number: item.number,
                sms: item.otp
            }));
        }
        return [];
    } catch (e) {
        return [];
    }
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo };
