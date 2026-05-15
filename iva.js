const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const { HttpsProxyAgent } = require("https-proxy-agent");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";

// 🟢 Bright Data Proxy Configuration (Dynamic)
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
let RAW_COOKIES = [];

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
  catch { return null; }
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

/* ================= 🟢 LOGIN FUNCTION ================= */
async function loginIVAS(email, password) {
  try {
    resetProxySession(); 
    console.log("[IVA] Fetching login page via Bright Data Web Unlocker. Waiting for Cloudflare...");
    
    const getRes = await makeRequest("GET", "/login", null, null, {});
    
    let tokenMatch = getRes.body.match(/name="_token"\s+value="([^"]+)"/) || 
                     getRes.body.match(/"csrf-token"\s+content="([^"]+)"/);
    let csrfToken = tokenMatch ? tokenMatch[1] : null;

    if (!csrfToken) {
        console.log("[IVA] ❌ Cloudflare block detected.");
        return { success: false, error: "Cloudflare challenge blocked the request. Web Unlocker could not bypass it." };
    }

    console.log("[IVA] ✅ CSRF Token fetched. Submitting login form...");
    const postBody = new URLSearchParams({ _token: csrfToken, email: email, password: password }).toString();

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

/* ================= 🟢 GET NUMBERS (FETCH FROM /portal/numbers) ================= */
async function getNumbers(token) {
  const ts = Date.now();
  // 1st Attempt: Fetch via standard Datatables API for /portal/numbers
  const path = `/portal/numbers?draw=1&columns[0][data]=number_id&columns[0][name]=id&columns[0][orderable]=false&columns[1][data]=Number&columns[2][data]=range&columns[3][data]=A2P&columns[4][data]=LimitA2P&columns[5][data]=limit_cli_a2p&columns[6][data]=limit_cli_did_a2p&columns[7][data]=action&columns[7][searchable]=false&columns[7][orderable]=false&order[0][column]=1&order[0][dir]=desc&start=0&length=5000&search[value]=&_=${ts}`;

  let resp = await makeRequest("GET", path, null, null, {
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `${BASE_URL}/portal/numbers`,
    "Accept": "application/json, text/javascript, */*; q=0.01"
  }).catch(() => null);

  let aaData = [];

  if (resp && resp.body) {
      const json = safeJSON(resp.body);
      if (json && json.data) {
          aaData = json.data.map(row => [row.range || "", "", String(row.Number || ""), "Weekly", ""]);
          return { aaData };
      }
  }

  // 2nd Attempt: Fetch directly from the HTML page if API returns no data
  resp = await makeRequest("GET", "/portal/numbers", null, null, {
    "Referer": `${BASE_URL}/portal`,
    "Accept": "text/html,application/xhtml+xml"
  }).catch(() => null);

  if (resp && resp.body) {
     const clean = t => (t || "").replace(/<[^>]+>/g, "").trim();
     const trAll = [...resp.body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
     for (const trM of trAll) {
         if (trM[1].includes("<th") || trM[1].includes("No data available")) continue;
         const tds = [...trM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
         if (tds.length >= 3) {
             let number = clean(tds[1][1]);
             let range = clean(tds[2][1]);
             if (number.match(/\d{5,}/)) {
                 aaData.push([range, "", number, "Weekly", ""]);
             }
         }
     }
  }

  return { aaData };
}

/* ================= 🟢 GET SMS (FETCH FROM /portal/live/my_sms) ================= */
async function getSMS(token) {
  let resp = await makeRequest("GET", "/portal/live/my_sms", null, null, {
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${BASE_URL}/portal/numbers`,
      "Accept": "application/json, text/html, */*; q=0.01"
  }).catch(() => null);

  let allRows = [];
  if (!resp || !resp.body) return { aaData: [] };

  let json = safeJSON(resp.body);
  const clean = t => (t || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();

  // Try JSON Parse (if page loads via AJAX Datatable)
  if (json && json.data) {
       json.data.forEach(row => {
           let range = row.range || row.Range || "";
           let number = row.number || row.Number || row.receiver || "";
           let message = row.message || row.Message || row.msg || "";
           let time = row.created_at || row.date || row.time || "";
           let sender = row.sender || row.Sender || row.cli || "";

           if (Array.isArray(row)) {
               time = row[0] || time;
               range = row[1] || range;
               number = row[2] || number;
               sender = row[3] || sender;
               message = row[4] || message;
           }

           if (number && message) allRows.push([clean(time), clean(range), clean(number), clean(sender), clean(message)]);
       });
  } else {
       // Try HTML Parse (if page returns raw table directly)
       const trAll = [...resp.body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
       for (const trM of trAll) {
           const row = trM[1];
           if (row.includes("<th") || row.includes("No data available")) continue;
           
           const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
           if (tds.length >= 4) {
               let time = clean(tds[0][1]);
               let range = clean(tds[1][1]);
               let number = clean(tds[2][1]);
               let sender = clean(tds[3][1]);
               let message = clean(tds[4] ? tds[4][1] : (tds[3] ? tds[3][1] : ""));

               let numMatch = number.match(/\d+/);
               if (numMatch) number = numMatch[0];

               if (number && message) allRows.push([time, range, number, sender, message]);
           } else {
               // Fallback structure for unknown elements
               let msgM = row.match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i) || row.match(/class="message"[^>]*>([\s\S]*?)<\/div>/i);
               let numM = row.match(/\b\d{8,15}\b/);
               let message = msgM ? clean(msgM[1]) : "";
               let number = numM ? numM[0] : "";
               if (message && number) allRows.push([getToday(), "UNKNOWN", number, "SMS", message]);
           }
       }
  }

  return { aaData: allRows };
}

module.exports = {
  router, setCookies, getCookies, getNumbers, getSMS, makeRequest, getToday, BASE_URL, loginIVAS, setProxyConfig
};
