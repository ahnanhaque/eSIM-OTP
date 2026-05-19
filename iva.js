let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// 🟢 Dynamic Import for Modern ESM Package (Fixes the Export Error)
async function fetchGot() {
    const mod = await import('got-scraping');
    return mod.gotScraping;
}

// 🟢 Auto Login Function for iVAS (Cloudflare Bypass)
async function login(email, password) {
    try {
        const gotScraping = await fetchGot(); // ডাইনামিক লোড
        
        const response = await gotScraping({
            url: "https://ivasms.com/login.php",
            method: "POST",
            form: {
                login_id: email,
                password: password
            },
            headers: {
                "referer": "https://ivasms.com/login.php"
            }
        });

        // কুকি এক্সট্র্যাক্ট করা
        let tempCookies = "";
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
            let extracted = [];
            if (Array.isArray(setCookieHeader)) {
                setCookieHeader.forEach(c => extracted.push(c.split(";")[0]));
            } else {
                extracted.push(setCookieHeader.split(";")[0]);
            }
            tempCookies = extracted.join("; ");
        }

        if (response.statusCode === 302 || tempCookies.includes("remember") || response.statusCode === 200) {
            COOKIES = tempCookies;
            return COOKIES;
        }
        throw new Error("Invalid credentials or Cloudflare blocked the login.");
    } catch (err) {
        throw new Error(err.message || "iVAS Login Failed");
    }
}

// 🟢 Get Number Function (Cloudflare Bypass)
async function getNumber(range) {
    try {
        const gotScraping = await fetchGot(); // ডাইনামিক লোড
        
        const boundary = "----WebKitFormBoundaryd1BBMabQSSbA47sv";
        const bodyStr = [
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

        const response = await gotScraping({
            url: "https://ivasms.com/API/api_handler.php",
            method: "POST",
            body: bodyStr,
            headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "cookie": COOKIES || ""
            }
        });

        let resData;
        try {
            resData = JSON.parse(response.body);
        } catch {
            resData = response.body; // JSON না হলে HTML হিসেবে ধরবে
        }

        // 🔴 সেশন এক্সপায়ার বা ক্লাউডফ্লেয়ার ব্লক ডিটেকশন
        if (response.statusCode === 302 || (typeof resData === 'string' && resData.includes('login_id'))) {
            throw new Error("SESSION_EXPIRED");
        }
        if (resData && resData.status === "success" && resData.number) {
            return resData;
        }
        throw new Error((resData && resData.message) ? resData.message : "SESSION_EXPIRED");
    } catch (err) {
        if (err.message === "SESSION_EXPIRED") throw err;
        throw new Error("SESSION_EXPIRED");
    }
}

module.exports = { setCookies, login, getNumber };
