const BASE_URL = "http://smshadi.net"; 
let currentCookies = "";

function setCookies(cookies) {
    currentCookies = cookies;
}

function getCookies() {
    return currentCookies;
}

// 🟢 Auto Math Captcha Solver & Login
async function login(username, password) {
    try {
        const getRes = await fetch(`${BASE_URL}/`);
        const html = await getRes.text();

        let initialCookie = "";
        const rawCookies = getRes.headers.get('set-cookie');
        if (rawCookies) {
            initialCookie = rawCookies.split(';')[0]; 
        }

        const mathRegex = /What is (\d+)\s*\+\s*(\d+)\s*=\s*\?/;
        const match = html.match(mathRegex);
        
        if (!match) throw new Error("Captcha pattern not found on the login page.");

        const num1 = parseInt(match[1], 10);
        const num2 = parseInt(match[2], 10);
        const captAnswer = num1 + num2;

        console.log(`[HADI] Captcha Solved: ${num1} + ${num2} = ${captAnswer}`);

        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('capt', captAnswer); 

        const postRes = await fetch(`${BASE_URL}/signin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': initialCookie,
                'Referer': `${BASE_URL}/`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
                'Upgrade-Insecure-Requests': '1'
            },
            body: formData.toString(),
            redirect: 'manual' 
        });

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
    } catch (error) { throw error; }
}

// 🟢 Get Number (cURL থেকে)
async function getNumber(countryCode) {
    if (!currentCookies) throw new Error("SESSION_EXPIRED");
    try {
        const url = `${BASE_URL}/client/MySMSNumbers`; 
        const getRes = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,de-DE;q=0.8,de;q=0.7',
                'Connection': 'keep-alive',
                'Cookie': currentCookies,
                'Referer': `${BASE_URL}/client/SMSDashboard`,
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
            }
        });

        const html = await getRes.text();
        const numberMatch = html.match(/\b\d{10,15}\b/); 

        if (numberMatch && numberMatch[0]) return { number: numberMatch[0] };
        else throw new Error("Out of Stock or Number not found.");
    } catch (error) { throw error; }
}

// 🟢 Check SMS (cURL থেকে OTP বের করার লজিক)
async function checkInfo() {
    if (!currentCookies) return [];
    try {
        const url = `${BASE_URL}/client/SMSCDRStats`;
        const getRes = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,de-DE;q=0.8,de;q=0.7',
                'Connection': 'keep-alive',
                'Cookie': currentCookies,
                'Referer': `${BASE_URL}/client/SMSCDRStats`,
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
            }
        });

        const html = await getRes.text();
        const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
        let results = [];

        for (let row of rows) {
            const numMatch = row.match(/\b\d{10,15}\b/);
            if (numMatch) {
                const plainText = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                results.push({
                    number: numMatch[0],
                    sms: plainText,
                    status: 'completed'
                });
            }
        }
        return results;
    } catch (e) { return []; }
}

module.exports = { login, setCookies, getCookies, getNumber, checkInfo };
