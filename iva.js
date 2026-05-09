const express = require("express");
const https   = require("https");
const zlib    = require("zlib");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";
const USER_AGENT     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

let COOKIES = { "XSRF-TOKEN": "", "ivas_sms_session": "" };

function setCookies(xsrf, session) {
  COOKIES["XSRF-TOKEN"] = xsrf;
  COOKIES["ivas_sms_session"] = session;
}

function getCookies() {
  return COOKIES;
}

/* ================= HELPERS ================= */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function cookieString() {
  return Object.entries(COOKIES).map(([k,v]) => `${k}=${v}`).join("; ");
}

function getXsrf() {
  try { return decodeURIComponent(COOKIES["XSRF-TOKEN"] || ""); }
  catch { return COOKIES["XSRF-TOKEN"] || ""; }
}

function safeJSON(text) {
  try { return JSON.parse(text); }
  catch { return { error: "Invalid JSON", preview: text.substring(0, 300) }; }
}

/* ================= HTTP REQUEST ================= */
function makeRequest(method, path, body, contentType, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent":       USER_AGENT,
      "Accept":           "*/*",
      "Accept-Encoding":  "gzip, deflate, br",
      "Cookie":           cookieString(),
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN":     getXsrf(),
      "X-CSRF-TOKEN":     getXsrf(),
      "Origin":           BASE_URL,
      "Referer":          `${BASE_URL}/portal`,
      ...extraHeaders
    };

    if (method === "POST" && body) {
      headers["Content-Type"]   = contentType;
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(BASE_URL + path, { method, headers }, res => {
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
        if (res.statusCode === 401 || res.statusCode === 419 || text.includes('"message":"Unauthenticated"')) return reject(new Error("SESSION_EXPIRED"));
        resolve({ status: res.statusCode, body: text, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ================= FETCH _token ================= */
async function fetchToken() {
  const resp = await makeRequest("GET", "/portal", null, null, { "Accept": "text/html,application/xhtml+xml,*/*" }).catch(() => null);
  if (!resp) return null;
  const match = resp.body.match(/name="_token"\s+value="([^"]+)"/) || resp.body.match(/"csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}

/* ================= GET NUMBERS ================= */
async function getNumbers(token) {
  const ts = Date.now();
  const path = `/portal/numbers?draw=1&columns[0][data]=number_id&columns[0][name]=id&columns[0][orderable]=false&columns[1][data]=Number&columns[2][data]=range&columns[3][data]=A2P&columns[4][data]=LimitA2P&columns[5][data]=limit_cli_a2p&columns[6][data]=limit_cli_did_a2p&columns[7][data]=action&columns[7][searchable]=false&columns[7][orderable]=false&order[0][column]=1&order[0][dir]=desc&start=0&length=5000&search[value]=&_=${ts}`;
  const resp = await makeRequest("GET", path, null, null, { "Referer": `${BASE_URL}/portal/numbers`, "Accept": "application/json", "X-CSRF-TOKEN": token }).catch(() => null);
  if (!resp) return { aaData: [] };
  const json = safeJSON(resp.body);
  if (!json || !json.data) return json;
  const aaData = json.data.map(row => [row.range || "", "", String(row.Number || ""), "Weekly", ""]);
  return { sEcho: 2, iTotalRecords: String(json.recordsTotal || aaData.length), iTotalDisplayRecords: String(json.recordsFiltered || aaData.length), aaData };
}

/* ================= GET SMS ================= */
async function getSMS(token) {
  const today = getToday(), boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";
  const parts = [`--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`, `--${boundary}--`].join("\r\n");
  const r1 = await makeRequest("POST", "/portal/sms/received/getsms", parts, `multipart/form-data; boundary=${boundary}`, { "Referer": `${BASE_URL}/portal/sms/received` }).catch(() => null);
  if (!r1) return { aaData: [] };
  const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]), allRows = [];
  for (const range of ranges) {
    const b2 = new URLSearchParams({ _token: token, start: today, end: today, range }).toString();
    const r2 = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/sms/received` }).catch(() => null);
    if (!r2) continue;
    const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);
    for (const number of numbers) {
      const b3 = new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range }).toString();
      const r3 = await makeRequest("POST", "/portal/sms/received/getsms/number/sms", b3, "application/x-www-form-urlencoded", { "Referer": `${BASE_URL}/portal/sms/received` }).catch(() => null);
      if (!r3) continue;
      allRows.push(...parseSMSMessages(r3.body, range, number, today));
    }
  }
  allRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
  return { sEcho: 1, iTotalRecords: String(allRows.length), iTotalDisplayRecords: String(allRows.length), aaData: allRows };
}

function parseSMSMessages(html, range, number, date) {
  const rows = [];
  const clean = t => (t || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
  const trAll = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const trM of trAll) {
    const row = trM[1];
    if (row.includes("<th")) continue;
    const senderM = row.match(/class="cli-tag"[^>]*>([^<]+)</), msgM = row.match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i), timeM = row.match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*</);
    if (msgM) rows.push([`${date} ${timeM ? timeM[1].trim() : "00:00:00"}`, range, number, senderM ? senderM[1].trim() : "SMS", clean(msgM[1]), "$", 0]);
  }
  return rows;
}

module.exports = { router, setCookies, getCookies, fetchToken, getNumbers, getSMS, makeRequest, parseSMSMessages, getToday, BASE_URL };
