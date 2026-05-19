const { gotScraping } = require('got-scraping');
const cheerio = require('cheerio'); // HTML Parsing এর জন্য এটি লাগবে

const BASE_URL = "https://www.ivasms.com";
let COOKIES = "";

function setCookies(cookies) {
    COOKIES = cookies;
}

// 🟢 Cloudflare Bypass Helper
async function request(method, path, body = null, headers = {}, isForm = false) {
    const options = {
        url: BASE_URL + path,
        method: method,
        headers: {
            "Cookie": COOKIES,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ...headers
        },
        throwHttpErrors: false
    };

    if (body) {
        if (isForm) options.form = body;
        else options.body = body;
    }

    const resp = await gotScraping(options);
    if (resp.statusCode === 401 || resp.statusCode === 419) throw new Error("SESSION_EXPIRED");
    return resp;
}

async function fetchToken() {
    const resp = await request("GET", "/portal");
    const $ = cheerio.load(resp.body);
    return $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val();
}

async function getNumbers(token) {
    const ts = Date.now();
    const resp = await request("GET", `/portal/numbers?draw=1&length=5000&_=${ts}`, null, { "X-CSRF-TOKEN": token });
    const json = JSON.parse(resp.body);
    if (!json.data) return { aaData: [] };
    return { aaData: json.data.map(r => [r.range || "", "", String(r.Number || ""), "Weekly", ""]) };
}

// 🟢 SMS পার্সিং লজিক আগের মতোই রাখা হয়েছে
async function getSMS(token) {
    const today = new Date().toISOString().split('T')[0];
    const r1 = await request("POST", "/portal/sms/received/getsms", { from: today, to: today, _token: token }, {}, true);
    
    const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);
    let allRows = [];

    for (const range of ranges) {
        const r2 = await request("POST", "/portal/sms/received/getsms/number", { _token: token, start: today, end: today, range }, {}, true);
        const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);

        for (const number of numbers) {
            const r3 = await request("POST", "/portal/sms/received/getsms/number/sms", { _token: token, start: today, end: today, Number: number, Range: range }, {}, true);
            const msgs = parseSMSMessages(r3.body, range, number, today);
            allRows.push(...msgs);
        }
    }
    return { aaData: allRows.sort((a, b) => new Date(b[0]) - new Date(a[0])) };
}

function parseSMSMessages(html, range, number, date) {
    const $ = cheerio.load(html);
    let rows = [];
    $('tr').each((i, el) => {
        if ($(el).find('th').length) return;
        const sender = $(el).find('.cli-tag').text().trim() || "SMS";
        const message = $(el).find('.msg-text').text().trim();
        const time = $(el).find('.time-cell').text().trim();
        if (message) rows.push([`${date} ${time}`, range, number, sender, message, "$", 0]);
    });
    return rows;
}

module.exports = { setCookies, fetchToken, getNumbers, getSMS };
