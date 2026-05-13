const express = require("express");
const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL = "https://www.ivasms.com";

let BRIGHT_DATA_API_KEY = "";
let IVAS_EMAIL = "";
let IVAS_PASSWORD = "";

/* ================= SESSION VARIABLES ================= */
let CSRF_TOKEN = "";
let IVAS_COOKIES = "";

function setConfig(apiKey, email, password) {
  BRIGHT_DATA_API_KEY = apiKey;
  IVAS_EMAIL = email;
  IVAS_PASSWORD = password;
}

/* ================= BRIGHT DATA API REQUESTER ================= */
async function fetchViaBrightData(targetUrl, method = "GET", bodyData = null, contentType = null, extraHeaders = {}) {
  // ⚠️ 'web_unlocker1' আপনার Bright Data-এর জোন নেমের সাথে মিলতে হবে। 
  // যদি আপনার জোন নেম অন্য কিছু হয়, তাহলে সেটা এখানে বসিয়ে দিন।
  const bdPayload = { zone: "web_unlocker1", url: targetUrl, method: method };

  if (bodyData) bdPayload.body = bodyData;

  let headers = { ...extraHeaders, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
  if (IVAS_COOKIES) headers["Cookie"] = IVAS_COOKIES;
  if (contentType) headers["Content-Type"] = contentType;
  if (CSRF_TOKEN) {
    headers["X-XSRF-TOKEN"] = CSRF_TOKEN;
    headers["X-CSRF-TOKEN"] = CSRF_TOKEN;
  }
  headers["X-Requested-With"] = "XMLHttpRequest";

  bdPayload.headers = headers;

  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${BRIGHT_DATA_API_KEY}` },
    body: JSON.stringify(bdPayload)
  });

  return res;
}

/* ================= AUTO LOGIN SYSTEM ================= */
async function performAutoLogin() {
  console.log("🔄 [IVA] Initiating Auto-Login via Bright Data...");
  try {
    // ১. লগিন পেজ থেকে CSRF Token এবং Initial Cookie নেওয়া
    const res1 = await fetchViaBrightData(`${BASE_URL}/portal/login`, "GET");
    const html1 = await res1.text();

    if (!res1.ok) {
        console.log(`⚠️ [DEBUG] Bright Data HTTP Status: ${res1.status}`);
    }

    const tokenMatch = html1.match(/name="_token"\s+value="([^"]+)"/) || html1.match(/"csrf-token"\s+content="([^"]+)"/);
    
    if (tokenMatch) {
        CSRF_TOKEN = tokenMatch[1];
    } else {
        // টোকেন না পেলে Bright Data কী পাঠাচ্ছে সেটা লগে দেখাবে
        console.log("❌ [DEBUG] Bright Data Response Snippet:\n", html1.substring(0, 500)); 
        throw new Error("CSRF Token not found. (Check Render logs to see what Bright Data returned)");
    }

    let cookies = [];
    const cookieHeader1 = res1.headers.get("set-cookie");
    if (cookieHeader1) cookies.push(cookieHeader1.split(';')[0]);
    if (cookies.length > 0) IVAS_COOKIES = cookies.join("; ");

    // ২. Email, Password এবং Token দিয়ে POST রিকোয়েস্ট
    const loginParams = new URLSearchParams({ _token: CSRF_TOKEN, email: IVAS_EMAIL, password: IVAS_PASSWORD }).toString();
    const res2 = await fetchViaBrightData(`${BASE_URL}/portal/login`, "POST", loginParams, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/login` });

    const cookieHeader2 = res2.headers.get("set-cookie");
    if (cookieHeader2) {
      const sessionMatch = cookieHeader2.match(/(ivas_sms_session=[^;]+)/);
      if (sessionMatch) IVAS_COOKIES = sessionMatch[1] + (CSRF_TOKEN ? `; XSRF-TOKEN=${CSRF_TOKEN}` : "");
    }

    if (res2.status === 302 || res2.ok || (await res2.text()).includes("Dashboard")) {
      console.log("✅ [IVA] Auto-Login Successful! Session acquired.");
      return true;
    } else {
      console.log("❌ [IVA] Auto-Login Failed. Invalid credentials or blocked.");
      return false;
    }
  } catch (e) {
    console.log("❌ [IVA] Auto-Login Error:", e.message);
    return false;
  }
}

/* ================= GET NUMBERS ================= */
async function getNumbers() {
  const ts = Date.now();
  const path = `${BASE_URL}/portal/numbers?draw=1&columns[0][data]=number_id&columns[0][name]=id&columns[0][orderable]=false&columns[1][data]=Number&columns[2][data]=range&columns[3][data]=A2P&columns[4][data]=LimitA2P&columns[5][data]=limit_cli_a2p&columns[6][data]=limit_cli_did_a2p&columns[7][data]=action&columns[7][searchable]=false&columns[7][orderable]=false&order[0][column]=1&order[0][dir]=desc&start=0&length=5000&search[value]=&_=${ts}`;

  const res = await fetchViaBrightData(path, "GET", null, null, { "Referer": `${BASE_URL}/portal/numbers`, "Accept": "application/json" });
  
  if (!res || !res.ok) {
    if (res && (res.status === 401 || res.status === 419 || res.status === 403)) await performAutoLogin();
    return null;
  }

  const data = await res.json();
  let newRanges = {};
  let records = data.data || data;

  if (Array.isArray(records)) {
    records.forEach(item => {
      let country = item.range || item.country || item.Country || item[1] || "UNKNOWN";
      let number = item.Number || item.number || item[2] || item[0] || "";
      if (number && typeof number === 'string') {
        country = country.toUpperCase().trim();
        if (!newRanges[country]) newRanges[country] = [];
        newRanges[country].push(number.replace(/\D/g, ''));
      }
    });
  }
  return newRanges;
}

/* ================= HELPERS FOR SMS ================= */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseSMSMessages(html, range, number, date) {
  const rows = [];
  const clean = t => (t || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
  const trAll = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const trM of trAll) {
    const row = trM[1];
    if (row.includes("<th")) continue;

    const senderM = row.match(/class="cli-tag"[^>]*>([^<]+)</);
    const sender = senderM ? senderM[1].trim() : "SMS";

    const msgM = row.match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
    const message = msgM ? clean(msgM[1]) : "";

    const timeM = row.match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*</);
    const time = timeM ? timeM[1].trim() : "00:00:00";

    if (message) {
      rows.push({ time: `${date} ${time}`, range, number, sender, message });
    }
  }
  return rows;
}

/* ================= GET SMS ================= */
async function getSMS() {
  const today = getToday();
  const boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${CSRF_TOKEN}`,
    `--${boundary}--`
  ].join("\r\n");

  const res1 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms`, "POST", parts, `multipart/form-data; boundary=${boundary}`, { "Referer": `${BASE_URL}/portal/sms/received` });
  
  if (!res1 || !res1.ok) {
    if (res1 && (res1.status === 401 || res1.status === 419 || res1.status === 403)) await performAutoLogin();
    return [];
  }

  const html1 = await res1.text();
  const ranges = [...html1.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
  const allRows = [];

  for (const range of ranges) {
    const b2 = new URLSearchParams({ _token: CSRF_TOKEN, start: today, end: today, range }).toString();
    const res2 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms/number`, "POST", b2, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/sms/received` });
    if (!res2 || !res2.ok) continue;

    const html2 = await res2.text();
    const numbers = [...html2.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);

    for (const number of numbers) {
      const b3 = new URLSearchParams({ _token: CSRF_TOKEN, start: today, end: today, Number: number, Range: range }).toString();
      const res3 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms/number/sms`, "POST", b3, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/sms/received` });
      if (!res3 || !res3.ok) continue;

      const html3 = await res3.text();
      const msgs = parseSMSMessages(html3, range, number, today);
      allRows.push(...msgs);
    }
  }
  return allRows;
}

module.exports = {
  router, setConfig, performAutoLogin, getNumbers, getSMS
};
