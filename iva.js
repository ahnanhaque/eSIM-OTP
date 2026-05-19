const { HttpClient } = require("tls-client");

// Initialize client with custom browser identifier to mimic a real browser fingerprint
const client = new HttpClient({
    clientIdentifier: "chrome_120",
    followRedirects: true,
    timeout: 15000
});

let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// 🟢 Auto Login Function for iVAS using tls-client (Cloudflare Bypass)
async function login(email, password) {
    let tempCookies = ""; 
    try {
        // Step 1: GET request to get initial sessions
        const getRes = await client.get("https://ivasms.com/login.php", {
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        // Step 2: POST request to submit login credentials
        const body = new URLSearchParams({
            login_id: email,
            password: password
        }).toString();

        const res = await client.post("https://ivasms.com/login.php", body, {
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "referer": "https://ivasms.com/login.php"
            }
        });

        if (res.headers && res.headers["set-cookie"]) {
            let extracted = [];
            let cookiesHeader = res.headers["set-cookie"];
            if (Array.isArray(cookiesHeader)) {
                cookiesHeader.forEach(c => extracted.push(c.split(";")[0]));
            } else {
                extracted.push(cookiesHeader.split(";")[0]);
            }
            tempCookies = extracted.join("; ");
        } else if (res.cookies) {
            tempCookies = res.cookies.map(c => `${c.name}=${c.value}`).join("; ");
        }

        if (res.status === 302 || tempCookies.includes("remember") || res.status === 200) {
            COOKIES = tempCookies;
            return COOKIES;
        }
        throw new Error("Invalid credentials or Cloudflare block");
    } catch (err) {
        throw new Error(err.message || "iVAS Login Failed");
    }
}

// 🟢 Get Number Function using tls-client
async function getNumber(range) {
    try {
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

        const res = await client.post("https://ivasms.com/API/api_handler.php", body, {
            headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "cookie": COOKIES || "",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        if (res.status === 302 || (typeof res.data === 'string' && res.data.includes('login_id'))) {
            throw new Error("SESSION_EXPIRED");
        }
        if (res.data && res.data.status === "success" && res.data.number) {
            return res.data;
        }
        throw new Error((res.data && res.data.message) ? res.data.message : "SESSION_EXPIRED");
    } catch (err) {
        if (err.message === "SESSION_EXPIRED") throw err;
        throw new Error("SESSION_EXPIRED");
    }
}

module.exports = { setCookies, login, getNumber };
