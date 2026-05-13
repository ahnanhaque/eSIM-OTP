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
  // 🟢 Fixed: 'format': 'raw' add kora hoyeche jate validation error na ashe
  const bdPayload = { 
    zone: "web_unlocker1", 
    url: targetUrl, 
    method: method,
    format: "raw" 
  };

  if (bodyData) bdPayload.body = bodyData;

  let headers = { 
    ...extraHeaders, 
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" 
  };
  
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
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${BRIGHT_DATA_API_KEY}` 
    },
    body: JSON.stringify(bdPayload)
  });

  return res;
}

/* ================= AUTO LOGIN SYSTEM ================= */
async function performAutoLogin() {
  console.log("🔄 [IVA] Initiating Advanced Auto-Login via Bright Data...");
  try {
    // 1. Login page theke fresh CSRF Token ebong initial cookies newa
    const res1 = await fetchViaBrightData(`${BASE_URL}/portal/login`, "GET");
    const html1 = await res1.text();

    const tokenMatch = html1.match(/name="_token"\s+value="([^"]+)"/) || html1.match(/"csrf-token"\s+content="([^"]+)"/);
    
    if (tokenMatch) {
        CSRF_TOKEN = tokenMatch[1];
        console.log("🔑 [IVA] CSRF Token Found.");
    } else {
        throw new Error("CSRF Token not found on initial load.");
    }

    const cookieHeader1 = res1.headers.get("set-cookie");
    if (cookieHeader1) {
        // Shudhu proyojoniyo cookies gulo filter kore rakha
        IVAS_COOKIES = cookieHeader1.split(',').map(c => c.split(';')[0]).join('; ');
    }

    // 2. Login POST request
    const loginParams = new URLSearchParams({ 
        _token: CSRF_TOKEN, 
        email: IVAS_EMAIL, 
        password: IVAS_PASSWORD 
    }).toString();

    const res2 = await fetchViaBrightData(
        `${BASE_URL}/portal/login`, 
        "POST", 
        loginParams, 
        "application/x-www-form-urlencoded", 
        { "Referer": `${BASE_URL}/portal/login` }
    );

    const cookieHeader2 = res2.headers.get("set-cookie");
    if (cookieHeader2) {
      const sessionMatch = cookieHeader2.match(/(ivas_sms_session=[^;]+)/);
      if (sessionMatch) {
          IVAS_COOKIES = sessionMatch[1];
          console.log("✅ [IVA] Login Successful! New session acquired.");
          return true;
      }
    }

    // Redirect ba Dashboard check kora
    const finalHtml = await res2.text();
    if (finalHtml.includes("Dashboard") || res2.status === 302 || res2.status === 200) {
      console.log("✅ [IVA] Login confirmed.");
      return true;
    }

    console.log("❌ [IVA] Login failed. Invalid credentials or IP blocked.");
    return false;
  } catch (e) {
    console.log("❌ [IVA] Auto-Login Error:", e.message);
    return false;
  }
}

/* ================= GET NUMBERS & SMS ================= */
async function getNumbers() {
  const ts = Date.now();
  const path = `${BASE_URL}/portal/numbers?draw=1&columns[0][data]=number_id&columns[0][name]=id&columns[1][data]=Number&columns[2][data]=range&order[0][column]=1&order[0][dir]=desc&start=0&length=5000&_=${ts}`;

  const res = await fetchViaBrightData(path, "GET", null, null, { "Referer": `${BASE_URL}/portal/numbers`, "Accept": "application/json" });
  
  if (!res || res.status === 401 || res.status === 419) {
    await performAutoLogin();
    return null;
  }

  try {
      const data = await res.json();
      let newRanges = {};
      let records = data.data || [];
      records.forEach(item => {
          let country = (item.range || "UNKNOWN").toUpperCase().trim();
          let number = String(item.Number || "").replace(/\D/g, '');
          if (number) {
              if (!newRanges[country]) newRanges[country] = [];
              newRanges[country].push(number);
          }
      });
      return newRanges;
  } catch (e) { return null; }
}

async function getSMS() {
  const today = getToday();
  const parts = `_token=${CSRF_TOKEN}&from=${today}&to=${today}`;

  const res1 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms`, "POST", parts, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/sms/received` });
  
  if (!res1 || res1.status === 401 || res1.status === 419) {
    await performAutoLogin();
    return [];
  }

  const html1 = await res1.text();
  const ranges = [...html1.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
  const allRows = [];

  for (const range of ranges) {
    const b2 = `_token=${CSRF_TOKEN}&start=${today}&end=${today}&range=${range}`;
    const res2 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms/number`, "POST", b2, "application/x-www-form-urlencoded");
    if (!res2 || !res2.ok) continue;

    const html2 = await res2.text();
    const numbers = [...html2.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);

    for (const number of numbers) {
      const b3 = `_token=${CSRF_TOKEN}&start=${today}&end=${today}&Number=${number}&Range=${range}`;
      const res3 = await fetchViaBrightData(`${BASE_URL}/portal/sms/received/getsms/number/sms`, "POST", b3, "application/x-www-form-urlencoded");
      if (!res3 || !res3.ok) continue;

      const msgs = parseSMSMessages(await res3.text(), range, number, today);
      allRows.push(...msgs);
    }
  }
  return allRows;
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseSMSMessages(html, range, number, date) {
  const rows = [];
  const clean = t => (t || "").replace(/<[^>]+>/g, "").trim();
  const trAll = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const trM of trAll) {
    const row = trM[1];
    if (row.includes("<th")) continue;
    const senderM = row.match(/class="cli-tag"[^>]*>([^<]+)</);
    const msgM = row.match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
    const timeM = row.match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*</);

    if (msgM) {
      rows.push({ time: `${date} ${timeM ? timeM[1] : "00:00"}`, range, number, sender: senderM ? senderM[1] : "SMS", message: clean(msgM[1]) });
    }
  }
  return rows;
}

module.exports = { setConfig, performAutoLogin, getNumbers, getSMS };
