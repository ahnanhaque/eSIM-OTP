const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const { HttpsProxyAgent } = require("https-proxy-agent");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";

// 🟢 Bright Data Proxy Configuration (Now Dynamic)
let PROXY_HOST = "brd.superproxy.io";
let PROXY_PORT = 33335;
let PROXY_USER = "brd-customer-hl_2d9fa9c9-zone-esimbot";
let PROXY_PASS = "8po0jdioin6o";

function setProxyConfig(host, port, user, pass) {
    PROXY_HOST = host;
    PROXY_PORT = parseInt(port);
    PROXY_USER = user;
    PROXY_PASS = pass;
    resetProxySession();
    console.log("✅ [IVA] Proxy configuration successfully updated in memory!");
}

// Session-based Proxy Agent
let currentProxyAgent = null;

function getProxyAgent() {
    if (!currentProxyAgent) {
        const sessionId = `session-${Math.floor(Math.random() * 1000000)}`;
        const proxyUrl = `http://${PROXY_USER}-${sessionId}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
        currentProxyAgent = new HttpsProxyAgent(proxyUrl);
    }
    return currentProxyAgent;
}

function resetProxySession() {
    currentProxyAgent = null;
    RAW_COOKIES = [];
}

/* ================= COOKIES IN MEMORY ================= */
let XSRF_TOKEN = "";
let IVAS_SESSION = "";
let RAW_COOKIES = []; // Store ALL cookies (including Cloudflare clearance)

function setCookies(xsrf, session) {
  XSRF_TOKEN = xsrf;
  IVAS_SESSION = session;
  console.log("✅ [IVA] Clean Cookies successfully updated in memory!");
}

function getCookies() {
  return { xsrf: XSRF_TOKEN, session: IVAS_SESSION };
}

/* ================= HELPERS ================= */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getXsrf() {
  try { return decodeURIComponent(XSRF_TOKEN || ""); }
  catch { return XSRF_TOKEN || ""; }
}

function safeJSON(text) {
  try { return JSON.parse(text); }
  catch { return { error: "Invalid JSON", preview: text.substring(0, 300) }; }
}

/* ================= HTTP REQUEST WITH PROXY ================= */
function makeRequest(method, path, body, contentType, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    
    let cookieHeader = RAW_COOKIES.join("; ");
    if (!cookieHeader && XSRF_TOKEN && IVAS_SESSION) {
        cookieHeader = `XSRF-TOKEN=${XSRF_TOKEN}; ivas_sms_session=${IVAS_SESSION}`;
    }

    const headers = {
      "Accept":           "*/*",
      "Accept-Encoding":  "gzip, deflate, br",
      "Accept-Language":  "en-US,en;q=0.9",
      ...extraHeaders
    };
    
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    if (method === "POST" && body) {
      headers["Content-Type"]   = contentType;
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(BASE_URL + path, { 
        method, 
        headers, 
        agent: getProxyAgent(),
        rejectUnauthorized: false, 
        timeout: 90000 
    }, res => {
      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        try {
          const enc = res.headers["content-encoding"];
          if (enc === "gzip") buf = zlib.gunzipSync(buf);
          else if (enc === "br") buf = zlib.brotliDecompressSync(buf);
        } catch {}

        const text = buf.toString("utf-8");

        const setCookiesHeader = res.headers['set-cookie'];
        if (setCookiesHeader) {
            setCookiesHeader.forEach(c => {
                const rawCookie = c.split(';')[0];
                const cookieName = rawCookie.split('=')[0];
                
                let foundIndex = RAW_COOKIES.findIndex(rc => rc.startsWith(cookieName + '='));
                if (foundIndex !== -1) RAW_COOKIES[foundIndex] = rawCookie;
                else RAW_COOKIES.push(rawCookie);

                if (c.includes('XSRF-TOKEN=')) XSRF_TOKEN = decodeURIComponent(c.split('XSRF-TOKEN=')[1].split(';')[0]);
                if (c.includes('ivas_sms_session=')) IVAS_SESSION = decodeURIComponent(c.split('ivas_sms_session=')[1].split(';')[0]);
            });
        }

        if (res.statusCode === 401 || res.statusCode === 419 || res.statusCode === 403 || text.includes('"message":"Unauthenticated"')) {
          if (path !== "/login") return reject(new Error(`SESSION_EXPIRED (Status: ${res.statusCode})`));
        }

        resolve({ status: res.statusCode, body: text });
      });
    });

    req.on("error", (err) => {
        console.error("[IVA Request Error]:", err.message);
        reject(err);
    });
    
    req.on('timeout', () => {
        req.destroy();
        reject(new Error("Request Timed Out. Bright Data took too long to solve Cloudflare."));
    });

    if (body) req.write(body);
    req.end();
  });
}

/* ================= 🟢 NEW LOGIN FUNCTION ================= */
async function loginIVAS(email, password) {
  try {
    resetProxySession(); 
    console.log("[IVA] Fetching login page via Bright Data Web Unlocker. Waiting for Cloudflare...");
    
    const getRes = await makeRequest("GET", "/login", null, null, {});
    
    let tokenMatch = getRes.body.match(/name="_token"\s+value="([^"]+)"/) || 
                     getRes.body.match(/"csrf-token"\s+content="([^"]+)"/);
    let csrfToken = tokenMatch ? tokenMatch[1] : null;

    if (!csrfToken) {
        console.log("[IVA] ❌ Cloudflare block detected. Response Preview:", getRes.body.substring(0, 300));
        return { success: false, error: "Cloudflare challenge blocked the request. Web Unlocker could not bypass it." };
    }

    console.log("[IVA] ✅ CSRF Token fetched. Submitting login form...");
    const postBody = new URLSearchParams({
        _token: csrfToken,
        email: email,
        password: password
    }).toString();

    await makeRequest("POST", "/login", postBody, "application/x-www-form-urlencoded", {
      "Origin": BASE_URL,
      "Referer": `${BASE_URL}/login`
    });

    if (IVAS_SESSION && XSRF_TOKEN) {
       console.log("✅ [IVA] Logged in successfully!");
       return { success: true };
    } else {
       return { success: false, error: "Failed to retrieve session cookies. Check your credentials." };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ================= 🟢 GET NUMBERS (UPDATED FOR LIVE SMS PAGE) ================= */
async function getNumbers(token) {
  const today    = getToday();
  const boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`,
    `--${boundary}--`
  ].join("\r\n");

  const headersObj = {
      "X-Requested-With": "XMLHttpRequest", 
      "Referer": `${BASE_URL}/portal/sms/received`, 
      "Accept": "text/html, */*; q=0.01"
  };

  // 🟢 সরাসরি "Live SMS" এর সাইডবার থেকে রেঞ্জ ফেচ করা হচ্ছে
  const r1 = await makeRequest("POST", "/portal/sms/received/getsms", parts, `multipart/form-data; boundary=${boundary}`, headersObj).catch(() => null);
  if (!r1 || !r1.body) return { aaData: [] };

  const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
  const aaData = [];

  for (const range of ranges) {
    const b2 = new URLSearchParams({ _token: token, start: today, end: today, range }).toString();
    const r2  = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded", headersObj).catch(() => null);
    if (!r2 || !r2.body) continue;

    // 🟢 রেঞ্জের ভেতরের নাম্বারগুলো স্ক্যান করা হচ্ছে
    const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);
    for (const number of numbers) {
       // বটের ফরম্যাটে অ্যারে পুশ করা হচ্ছে
       aaData.push([range, "", String(number), "Weekly", ""]);
    }
  }

  return { aaData };
}

/* ================= GET SMS ================= */
async function getSMS(token) {
  const today    = getToday();
  const boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`,
    `--${boundary}--`
  ].join("\r\n");

  const headersObj = {
      "X-Requested-With": "XMLHttpRequest", 
      "Referer": `${BASE_URL}/portal/sms/received`, 
      "Accept": "text/html, */*; q=0.01"
  };

  const r1 = await makeRequest("POST", "/portal/sms/received/getsms", parts, `multipart/form-data; boundary=${boundary}`, headersObj).catch(() => null);
  if (!r1 || !r1.body) return { aaData: [] };

  const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
  const allRows = [];

  for (const range of ranges) {
    const b2 = new URLSearchParams({ _token: token, start: today, end: today, range }).toString();
    const r2  = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded", headersObj).catch(() => null);
    if (!r2 || !r2.body) continue;

    const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);

    for (const number of numbers) {
      const b3 = new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range }).toString();
      const r3  = await makeRequest("POST", "/portal/sms/received/getsms/number/sms", b3, "application/x-www-form-urlencoded", headersObj).catch(() => null);
      if (!r3 || !r3.body) continue;

      const msgs = parseSMSMessages(r3.body, range, number, today);
      allRows.push(...msgs);
    }
  }

  allRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));

  return {
    sEcho: 1,
    iTotalRecords: String(allRows.length),
    iTotalDisplayRecords: String(allRows.length),
    aaData: allRows
  };
}

function parseSMSMessages(html, range, number, date) {
  const rows  = [];
  const clean = t => (t || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
  const trAll = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const trM of trAll) {
    const row = trM[1];
    if (row.includes("<th")) continue;

    const senderM = row.match(/class="cli-tag"[^>]*>([^<]+)</);
    const sender  = senderM ? senderM[1].trim() : "SMS";

    const msgM   = row.match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
    const message = msgM ? clean(msgM[1]) : "";

    const timeM = row.match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*</);
    const time  = timeM ? timeM[1].trim() : "00:00:00";

    if (message) {
      rows.push([`${date} ${time}`, range, number, sender, message, "$", 0]);
    }
  }
  return rows;
}

module.exports = {
  router, setCookies, getCookies, getNumbers, getSMS, makeRequest, parseSMSMessages, getToday, BASE_URL, loginIVAS, setProxyConfig
};
