let currentCookies = "";
const BASE_URL = "https://zenexnetwork.com";

function setCookies(cookies) {
    currentCookies = cookies;
}

function getCookies() {
    return currentCookies;
}

// 🟢 Login (CSRF Token Bypass)
async function login(emailOrPhone, password) {
    try {
        // ১. প্রথমে সাইটে ভিজিট করে হিডেন টোকেন (CSRF Token) ও কুকি কালেক্ট করা
        const initRes = await fetch(`${BASE_URL}/login`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        let cookieString = "";
        if (initRes.headers.getSetCookie) {
            cookieString = initRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
        }

        const html = await initRes.text();
        let csrfToken = "";
        // HTML এর ভেতর থেকে টোকেনটি খুঁজে বের করা
        const tokenMatch = html.match(/<meta name="csrf-token" content="([^"]+)">/);
        if (tokenMatch) {
            csrfToken = tokenMatch[1];
        }

        // ২. এবার টোকেনসহ ইমেইল ও পাসওয়ার্ড পাঠানো
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': csrfToken, // 🟢 টোকেন অ্যাড করা হলো
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({ emailOrPhone, password })
        });

        // নতুন লগইন কুকি আপডেট করা
        if (res.headers.getSetCookie) {
            const newCookies = res.headers.getSetCookie().map(c => c.split(';')[0]);
            if (newCookies.length > 0) cookieString = newCookies.join('; ');
        }

        if (!res.ok) {
            throw new Error(`Server rejected (${res.status}). Wrong password or site issue!`);
        }

        currentCookies = cookieString;
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
        if (error.message.includes("Unexpected token") || error.message.includes("JSON") || error.message.includes("SESSION_EXPIRED")) {
            throw new Error("SESSION_EXPIRED");
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
