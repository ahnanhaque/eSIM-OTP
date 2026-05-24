let currentCookies = "";
const BASE_URL = "https://smshadi.net"; // প্যানেলের মূল লিংক

function setCookies(cookies) {
    currentCookies = cookies;
}

function getCookies() {
    return currentCookies;
}

// 🟢 Auto Math Captcha Solver & Login
async function login(username, password) {
    try {
        // ১. প্রথমে লগইন পেজ লোড করে সেশন কুকি এবং ক্যাপচা নিয়ে আসা
        const getRes = await fetch(`${BASE_URL}/`);
        const html = await getRes.text();

        let initialCookie = "";
        const rawCookies = getRes.headers.get('set-cookie');
        if (rawCookies) {
            initialCookie = rawCookies.split(';')[0]; 
        }

        // ২. রেগুলার এক্সপ্রেশন (Regex) দিয়ে ক্যাপচার নাম্বার দুটো খোঁজা
        const mathRegex = /What is (\d+)\s*\+\s*(\d+)\s*=\s*\?/;
        const match = html.match(mathRegex);
        
        if (!match) {
            throw new Error("Captcha pattern not found on the login page.");
        }

        // ৩. নাম্বার দুটো যোগ করে রেজাল্ট বের করা
        const num1 = parseInt(match[1], 10);
        const num2 = parseInt(match[2], 10);
        const captAnswer = num1 + num2;

        console.log(`[HADI] Captcha Solved: ${num1} + ${num2} = ${captAnswer}`);

        // ৪. লগইন রিকোয়েস্ট পাঠানো
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('capt', captAnswer); // অটোমেটিক যোগফল

        const postRes = await fetch(`${BASE_URL}/signin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': initialCookie,
                'Referer': `${BASE_URL}/`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: formData.toString(),
            redirect: 'manual' 
        });

        // ৫. লগইন সাকসেস হলে নতুন কুকি সেভ করা
        const loginCookies = postRes.headers.get('set-cookie');
        if (loginCookies) {
            currentCookies = loginCookies.split(';')[0];
        } else {
            currentCookies = initialCookie;
        }

        if (postRes.status !== 302 && postRes.status !== 301 && !postRes.ok) {
            throw new Error("Login failed! Please check credentials.");
        }

        return currentCookies;

    } catch (error) {
        throw error;
    }
}

// 🟢 Get Number (API Endpoint দরকার)
async function getNumber(range) {
    if (!currentCookies) throw new Error("SESSION_EXPIRED");
    // TODO: Number কেনার API রিকোয়েস্ট এখানে বসবে
}

// 🟢 Check SMS (API Endpoint দরকার)
async function checkInfo(dateStr) {
    if (!currentCookies) return [];
    // TODO: SMS চেক করার API রিকোয়েস্ট এখানে বসবে
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo };
