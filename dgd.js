const https = require("https");

const BASE_URL = "https://dgddigital.com";
const API_KEY = process.env.DGD_API_KEY;

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            "X-API-KEY": API_KEY,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        };

        if (body && method === "POST") {
            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = Buffer.byteLength(body);
        }

        const req = https.request(
            BASE_URL + path,
            {
                method,
                headers
            },
            res => {
                let chunks = [];

                res.on("data", d => chunks.push(d));

                res.on("end", () => {
                    const text = Buffer.concat(chunks).toString("utf8");

                    try {
                        resolve({
                            status: res.statusCode,
                            data: JSON.parse(text)
                        });
                    } catch {
                        resolve({
                            status: res.statusCode,
                            data: text
                        });
                    }
                });
            }
        );

        req.on("error", reject);

        if (body) req.write(body);

        req.end();
    });
}

async function getNumber(range) {

    const body = JSON.stringify({
        range: range,
        is_national: false,
        remove_plus: false
    });

    const res = await makeRequest(
        "POST",
        "/api/v1/user/getnum",
        body
    );

    if (res.status !== 200)
        throw new Error("DGD Server Error");

    if (!res.data.ok)
        throw new Error(res.data.message);

    const number =
        res.data.number ||
        res.data.phone ||
        res.data?.data?.number ||
        res.data?.data?.copy;

    if (!number)
        throw new Error("Number not found");

    return {
        number
    };
}

async function checkInfo(number) {

    const res = await makeRequest(
        "GET",
        "/api/v1/user/checknum?nomor=" +
            encodeURIComponent(number)
    );

    if (res.status !== 200)
        return null;

    if (!res.data.ok)
        return null;

    return res.data.data;
}

function startPolling(ctx) {

    const {
        pendingRequests,
        processFoundOTP
    } = ctx;

    let working = false;

    setInterval(async () => {

        if (working) return;

        working = true;

        try {

            const requests = Object.entries(
                pendingRequests
            ).filter(
                ([, r]) => r.isDGD
            );

            for (const [number] of requests) {

                try {

                    const info =
                        await checkInfo(number);

                    if (!info) continue;

                    if (
                        info.status === "SUKSES" &&
                        info.kode_otp
                    ) {

                        processFoundOTP(
                            number,
                            Date.now(),
                            info.kode_otp,
                            pendingRequests[number].country
                        );

                    }

                } catch {}

            }

        } finally {

            working = false;

        }

    }, 3500);

}

module.exports = {
    getNumber,
    checkInfo,
    startPolling
};
