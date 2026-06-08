const express        = require("express");
const TelegramBot    = require("node-telegram-bot-api");
const mongoose       = require("mongoose");
const { authenticator } = require("otplib");
const stex           = require("./stex.js");
const mk             = require("./mk.js");
const zenex          = require("./zenex.js"); 
const nxa            = require("./nxa.js");
const { detectCountryFromRange, getCountryInfo } = require("./country.js");

const consoleLogSchema = new mongoose.Schema({
    number: String,
    platform: String,
    country: String,
    range: String,
    carrier: String,
    otp: String,
    fullMessage: String,
    status: String,
    receivedAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 60 * 6
    }
});
const ConsoleLog = mongoose.model("ConsoleLog", consoleLogSchema);
const broadcastSchema = new mongoose.Schema({
    subject: String,
    message: String,
    category: String,
    priority: String,
    attachmentUrl: String,
    attachmentType: String,
    sentBy: String,
    isRead: {
    type: Boolean,
    default: false
},

Schem
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Broadcast = mongoose.model("Broadcast", broadcastSchema);
const botToken        = process.env.BOT_TOKEN        || "8529122267:AAE3FhrtnyQCGZ2xR2o8XYf2ao5xxIO5VYI";
const ADMIN_ID        = Number(process.env.ADMIN_ID) || 8278612952;
const GROUP_CHAT_ID   = Number(process.env.GROUP_CHAT_ID) || -1003852968469;
const GROUP_INVITE_LINK = process.env.GROUP_INVITE_LINK || "https://t.me/+x_1_25vVZJswNWM1";
const MONGODB_URI     = process.env.MONGODB_URI      || "mongodb+srv://ahnanhaque_db_user:p9WFrr4y95miiOsX@cluster0.ygxl28d.mongodb.net/?appName=Cluster0";
const PORT            = process.env.PORT             || 3000;
const RENDER_URL      = "https://esim-otp-btup.onrender.com"; 

const REQUIRED_CHANNELS = [
    { id: GROUP_CHAT_ID, link: GROUP_INVITE_LINK, name: "📢 Join Group 1" },
    { id: "@eCommerce_BD", link: "https://t.me/eCommerce_BD", name: "📢 Join Channel 2" }
];

const app = express();
app.use(express.json());
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const bot = new TelegramBot(botToken, { webHook: true });
bot.setWebHook(`${RENDER_URL}/bot${botToken}`);

app.post(`/bot${botToken}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});
// =====================================
// ANDROID APP API
// =====================================

app.get("/api/debug", (req, res) => {
    res.json({
        availableNumbers: db.availableNumbers,
        stexRanges: db.stexRanges,
        mkRanges: db.mkRanges,
        zenexRanges: db.zenexRanges,
        nxaRanges: db.nxaRanges
    });
});
app.get("/api/ranges", (req, res) => {
    try {

        const ranges = [];

        function normalizePlatform(platform) {
            if (platform === "fb") return "Facebook";
            if (platform === "fb_new") return "Facebook";
            if (platform === "ig") return "Instagram";
            if (platform === "wa") return "WhatsApp";

            return platform;
        }

        function addRanges(source, panel) {

            Object.keys(source || {}).forEach(platform => {

                Object.keys(source[platform] || {}).forEach(range => {

                    const item = source[platform][range];

                    ranges.push({
                        panel,
                        platform: normalizePlatform(platform),
                        country: item.country,
                        method: item.method,
                        range
                    });

                });

            });

        }

        addRanges(db.mkRanges, "MK");
        addRanges(db.stexRanges, "STEX");
        addRanges(db.zenexRanges, "ZENEX");
        addRanges(db.nxaRanges, "NXA");

        res.json(ranges);

    } catch (e) {

        res.status(500).json({
            success: false,
            error: e.message
        });

    }
});

app.get("/api/panels", (req, res) => {

    res.json([
        {
            id: "mk",
            name: "MK Network",
            connected: !!db.mkCookies,
            activeAccount: db.mkCreds?.email || null
        },
        {
            id: "stex",
            name: "STEX SMS",
            connected: !!db.stexToken,
            activeAccount: db.stexCreds?.email || null
        },
        {
            id: "zenex",
            name: "Zenex",
            connected: !!db.zenexCookies,
            activeAccount: db.zenexCreds?.email || null
        },
        {
            id: "nxa",
            name: "NXA",
            connected: !!db.nxaToken,
            activeAccount: db.nxaCreds?.email || null
        }
    ]);

});

app.post("/api/admin/panel/login", async (req, res) => {

    try {

        const { panel, email, password } = req.body;

        if (!panel || !email || !password) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }

        if (panel === "stex") {

            const token = await stex.login(email, password);

            db.stexToken = token;
            db.stexCreds = { email, password };

            if (!db.savedStexAccounts)
                db.savedStexAccounts = [];

            if (!db.savedStexAccounts.find(a => a.email === email))
                db.savedStexAccounts.push({ email, password });

        }

        else if (panel === "mk") {

            const cookieStr = await mk.login(email, password);

            db.mkCookies = cookieStr;
            db.mkCreds = { email, password };

            if (!db.savedMkAccounts)
                db.savedMkAccounts = [];

            if (!db.savedMkAccounts.find(a => a.email === email))
                db.savedMkAccounts.push({ email, password });

        }

        else if (panel === "zenex") {

            const cookieStr = await zenex.login(email, password);

            db.zenexCookies = cookieStr;
            db.zenexCreds = { email, password };

            if (!db.savedZenexAccounts)
                db.savedZenexAccounts = [];

            if (!db.savedZenexAccounts.find(a => a.email === email))
                db.savedZenexAccounts.push({ email, password });

        }

        else if (panel === "nxa") {

            const authData = await nxa.login(email, password);

            db.nxaToken = authData.token;
            db.nxaCookies = authData.cookie;
            db.nxaCreds = { email, password };

            if (!db.savedNxaAccounts)
                db.savedNxaAccounts = [];

            if (!db.savedNxaAccounts.find(a => a.email === email))
                db.savedNxaAccounts.push({ email, password });

        }

        else {

            return res.status(400).json({
                success: false,
                error: "Invalid panel"
            });

        }

        saveDB();

        res.json({
            success: true,
            panel,
            email
        });

    } catch (e) {

        res.status(500).json({
            success: false,
            error: e.message
        });

    }

});
app.get("/api/dashboard", (req, res) => {
    res.json({
        totalUsers: db.users.length,
        activeRequests: Object.keys(pendingRequests).length,
        balanceUsers: Object.keys(db.balances).length,
        maxNumbers: db.settings.maxNumbers || 4
    });
});



app.get("/api/admin/panel/accounts", (req, res) => {
    res.json({
        stex: db.savedStexAccounts || [],
        mk: db.savedMkAccounts || [],
        zenex: db.savedZenexAccounts || [],
        nxa: db.savedNxaAccounts || []
    });
});

app.get("/api/admin/panel/active", (req, res) => {
    res.json({
        stex: db.stexCreds || null,
        mk: db.mkCreds || null,
        zenex: db.zenexCreds || null,
        nxa: db.nxaCreds || null
    });
});

app.get("/api/profile/:id", (req, res) => {
    const userId = req.params.id;

    res.json({
        userId,
        balance: db.balances[userId] || 0,
        referredBy: db.referred[userId] || null,
        isAdmin:
            userId == ADMIN_ID ||
            db.adminUsernames.includes(
                "@" + String(userId).toLowerCase()
            )
    });
});

app.get("/api/live-traffic", async (req, res) => {
    try {
        if (!db.zenexCookies) {
            return res.json([]);
        }

        const routes = await zenex.getLiveTraffic(
            db.zenexCookies
        );

        res.json(routes);
    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});

app.post("/api/get-number", async (req, res) => {

    try {

        const { platform, country } = req.body;

        let selected = null;

        function findRange(source, panelName) {

            Object.keys(source || {}).forEach(p => {

                Object.keys(source[p] || {}).forEach(range => {

                    const item = source[p][range];

                    const pName =
                        p === "fb" || p === "fb_new" ? "Facebook" :
                        p === "ig" ? "Instagram" :
                        p === "wa" ? "WhatsApp" :
                        p;

                    if (
                        !selected &&
                        pName === platform &&
                        item.country === country
                    ) {
                        selected = {
                            panel: panelName,
                            range,
                            method: item.method
                        };
                    }

                });

            });

        }

        findRange(db.mkRanges, "MK");
        findRange(db.stexRanges, "STEX");
        findRange(db.zenexRanges, "ZENEX");
        findRange(db.nxaRanges, "NXA");

        if (!selected) {
            return res.status(404).json({
                success: false,
                error: "No route found"
            });
        }

        let number = null;
        let internal_id = null;

        if (selected.panel === "MK") {

            const data = await mk.getNumber(
                selected.range,
                db.mkCookies
            );

            number = data.number;

        } else if (selected.panel === "STEX") {

            const data = await stex.getNumber(
                selected.range,
                db.stexToken
            );

            number = data.full_number;

        } else if (selected.panel === "ZENEX") {

            const data = await zenex.getNumber(
                selected.range
            );

            number = data.number;

        } else if (selected.panel === "NXA") {

            const data = await nxa.getNumber(
                selected.range,
                db.nxaToken,
                db.nxaCookies
            );

            number = data.number;
            internal_id = data.internal_id;

        }

        if (!number) {
            return res.status(500).json({
                success: false,
                error: "No number received"
            });
        }
        number = String(number).trim();

        if (!number.startsWith("+")) {
            number = "+" + number;
        }
        inUseNumbers[number] = true;

        pendingRequests[number] = {
            country,
            platform,
            carrier: selected.method,
            range: selected.range,
            createdAt: Date.now(),
            isStex: selected.panel === "STEX",
            token: selected.panel === "STEX" ? db.stexToken : (selected.panel === "NXA" ? db.nxaToken : undefined),
            isMk: selected.panel === "MK",
            cookie: selected.panel === "MK" ? db.mkCookies : (selected.panel === "ZENEX" ? db.zenexCookies : (selected.panel === "NXA" ? db.nxaCookies : undefined)),
            isZenex: selected.panel === "ZENEX",
            isNxa: selected.panel === "NXA",
            internal_id: selected.panel === "NXA" ? internal_id : undefined
        };
        syncPending();

       ConsoleLog.create({
    number,
    platform,
    country,
    range: selected.range,
    carrier: selected.method,
    status: "pending"
}).catch(()=>{});

        res.json({
            success: true,
            number,
            country,
            platform,
            expiresIn: 900
        });

    } catch (e) {

        res.status(500).json({
            success: false,
            error: e.message
        });

    }

});
// =====================================
// OTP CHECK API
// =====================================

app.get("/api/check-otp/:number", (req, res) => {

    try {

        let number = req.params.number;

        let request = pendingRequests[number];

        if (!request && !number.startsWith("+")) {
            request = pendingRequests["+" + number];
            if (request) number = "+" + number;
        }
        if (!request && number.startsWith("+")) {
            request = pendingRequests[number.substring(1)];
            if (request) number = number.substring(1);
        }

        if (!request) {
            return res.json({
                success: false,
                status: "expired"
            });
        }

        if (request.status === "success" || request.otp) {
            return res.json({
                success: true,
                status: "success",
                otp: request.otp,
                message: request.message || ""
            });
        }

        return res.json({
            success: true,
            status: "pending"
        });

    } catch (e) {

        console.error("OTP CHECK ERROR:", e);
         console.log("LIVE CONSOLE ERROR:", e);
console.log("SELECTED LOG:", JSON.stringify(liveLog, null, 2));
console.log("MSG TEXT:", msgText);
        return res.status(500).json({
            success: false,
            error: e.message
        });

    }

});
app.post("/api/admin/broadcast", async (req, res) => {
    try {
        const {
            subject,
            message,
            category,
            priority
        } = req.body;

        const broadcast = await Broadcast.create({
            subject,
            message,
            category,
            priority,
            sentBy: "System",
            isRead: false
        });

        res.json({
            success: true,
            broadcast
        });
    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});
app.delete("/api/admin/broadcast/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await Broadcast.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: "Broadcast not found"
            });
        }

        res.json({
            success: true,
            message: "Broadcast deleted successfully"
        });
    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});
app.get("/api/notifications", async (req, res) => {
    try {
        const notifications = await Broadcast.find()
            .sort({ createdAt: -1 })
            .lean();

        res.json(notifications);
    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});
app.get("/api/console", async (req, res) => {
    try {
        const query = req.query.q || "";
        let filter = {};
        if (query) {
            const regex = new RegExp(query, "i");
            filter = {
                $or: [
                    { number: regex },
                    { platform: regex },
                    { country: regex }
                ]
            };
        }
        const logs = await ConsoleLog.find(filter)
            .sort({ receivedAt: -1 })
            .select("number range platform country carrier otp fullMessage status receivedAt -_id")
            .lean();

        res.json(logs);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
    
bot.on("error", (err) => {
    if (err && err.message && !err.message.includes("message is not modified"))
        console.log("\n[Telegram Bot Error]", err.message);
});

bot.setMyCommands([
    { command: "start", description: "Restart the bot" },
    { command: "admin", description: "Open admin panel" }
]);

let botInfo = {};
bot.getMe().then(info => botInfo = info).catch(console.error);

const dbSchema = new mongoose.Schema({
    balances:           Object,
    lastAssigned:       Object,
    adminUsernames:     Array,
    users:              Array,
    referred:           Object,
    settings:           Object,
    availableNumbers:   Object,
    cookies:            Object,
    stexRanges:         Object,
    stexToken:          String,
    mkRanges:           Object,
    mkCookies:          String,
    zenexRanges:        Object, 
    zenexCookies:       String, 
    nxaRanges:          Object,
    nxaToken:           String,
    nxaCookies:         String,
    stexCreds:          Object,
    mkCreds:            Object,
    zenexCreds:         Object, 
    nxaCreds:           Object,
    savedStexAccounts:  Array,
    savedMkAccounts:    Array,
    savedZenexAccounts: Array,
    savedNxaAccounts:   Array,
    pendingRequests:    Object
}, { strict: false });

const BotDB = mongoose.model("BotData", dbSchema);

let db = {
    balances:          {},
    lastAssigned:      {},
    adminUsernames:    [],
    users:             [],
    referred:          {},
    settings:          { maxNumbers: 4, lastBroadcast: [] }, 
    availableNumbers:  { fb: {}, ig: {}, wa: {} },
    cookies:           {},
    stexRanges:        { fb: {}, ig: {}, wa: {} },
    stexToken:         "",
    mkRanges:          { fb: {}, ig: {}, wa: {} },
    mkCookies:         "",
    zenexRanges:       { fb: {}, ig: {}, wa: {} }, 
    zenexCookies:      "", 
    nxaRanges:         { fb: {}, ig: {}, wa: {} },
    nxaToken:          "",
    nxaCookies:        "",
    stexCreds:         null,
    mkCreds:           null,
    zenexCreds:        null, 
    nxaCreds:          null,
    savedStexAccounts: [],
    savedMkAccounts:   [],
    savedZenexAccounts:[],
    savedNxaAccounts:  [],
    pendingRequests:   {}
};

let isDbLoaded             = false;
let latestRangesFromExtension = {};
let pendingRequests        = {};
let lastProcessedOTPTime   = {};
let inUseNumbers           = {};
let userStates             = {};
let tempAdminData          = {};
let activeTempMails        = {};
let activeNumberMessages   = {};
let activeTimeouts         = {}; 

function syncPending() {
    db.pendingRequests = pendingRequests;
    saveDB();
}

function saveDB() {
    if (!isDbLoaded) return;
    BotDB.updateOne({}, db, { upsert: true }).catch(() => {});
}

function getBalance(chatId) {
    return db.balances[chatId] || 0;
}

function addBalance(chatId, amount) {
    if (!db.balances[chatId]) db.balances[chatId] = 0;
    db.balances[chatId] += amount;
    saveDB();
}

function isSuperAdmin(chatId) {
    return chatId === ADMIN_ID;
}

function isAdmin(chatId, username) {
    if (isSuperAdmin(chatId)) return true;
    let un = username ? "@" + username.replace("@", "").toLowerCase() : null;
    return un && db.adminUsernames.includes(un);
}

async function isUserMember(userId) {
    if (isSuperAdmin(userId)) return true;
    for (let channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.getChatMember(channel.id, userId);
            if (!["creator", "administrator", "member", "restricted"].includes(member.status)) {
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    return true;
}

function sendJoinPrompt(chatId) {
    let inline_keyboard = [];
    REQUIRED_CHANNELS.forEach(ch => {
        inline_keyboard.push([{ text: ch.name, url: ch.link }]);
    });
    inline_keyboard.push([{ text: "🔄 Check Again", callback_data: "check_join" }]);

    bot.sendMessage(chatId,
        `⚠️ **Access Denied!**\n\nYou must join all our official groups and channels first to use this bot. Once joined, click the check button below.`,
        {
            reply_markup: { inline_keyboard: inline_keyboard },
            parse_mode: "Markdown"
        }
    ).catch(() => {});
}

function clearPendingForChat(chatId) {
    if (activeTimeouts[chatId]) {
        clearTimeout(activeTimeouts[chatId]);
        delete activeTimeouts[chatId];
    }
    for (let num in pendingRequests) {
        if (pendingRequests[num].chatId === chatId && pendingRequests[num].status !== "success") {
            ConsoleLog.findOneAndUpdate({ number: num, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
            delete inUseNumbers[num];
            delete pendingRequests[num];
        }
    }
    syncPending();
}

function detectPlatform(from, subject, body) {
    let str = (from + " " + subject + " " + (body || "")).toLowerCase();
    if (str.includes("facebook"))  return "Facebook";
    if (str.includes("instagram")) return "Instagram";
    if (str.includes("whatsapp"))  return "WhatsApp";
    if (str.includes("tiktok"))    return "TikTok";
    if (str.includes("google"))    return "Google";
    if (str.includes("twitter") || str.includes("x.com")) return "X (Twitter)";
    if (str.includes("telegram"))  return "Telegram";
    if (str.includes("discord"))   return "Discord";
    if (str.includes("owlproxy"))  return "OwlProxy";

    let domainMatch = from.match(/@([a-zA-Z0-9.-]+)\./);
    if (domainMatch) {
        let domain = domainMatch[1].replace(/mail|security|info|noreply/ig, "");
        if (domain.length > 2) return domain.charAt(0).toUpperCase() + domain.slice(1);
        return domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
    }
    return "Unknown Platform";
}

function getReplyMenu(chatId, username) {
    let keyboard = [
        [{ text: "☎️ Get Number" }, { text: "📧 Temp Mail" }],
        [{ text: "🔑 2FA" },        { text: "👤 Profile" }]
    ];
    
    if (isAdmin(chatId, username)) {
        keyboard.push([{ text: "💬 Support" }, { text: "📈 Live Traffic" }]);
        keyboard.push([{ text: "⚙️ Admin Panel" }]);
    } else {
        keyboard.push([{ text: "💬 Support" }, { text: "📈 Live Traffic" }]);
    }
    return { keyboard, resize_keyboard: true, is_persistent: true };
}

const platformMenu = {
    inline_keyboard: [
        [{ text: "ⓕ Facebook",  callback_data: "menu_country_fb" }],
        [{ text: "ⓘ Instagram", callback_data: "menu_country_ig" }],
        [{ text: "✆ WhatsApp",  callback_data: "menu_country_wa" }],
        [{ text: "✖ Close Menu", callback_data: "close_menu" }]
    ]
};

const adminPlatformMenu = {
    inline_keyboard: [
        [{ text: "ⓕ Facebook",     callback_data: "admin_sel_plat_fb" }],
        [{ text: "ⓘ Instagram",    callback_data: "admin_sel_plat_ig" }],
        [{ text: "✆ WhatsApp",     callback_data: "admin_sel_plat_wa" }],
        [{ text: "🗑️ Remove Number", callback_data: "admin_remove_number_menu" }],
        [{ text: "⬅️ Back",        callback_data: "admin_panel" }]
    ]
};

const manageNumberPanel = {
    inline_keyboard: [
        [{ text: "IVA SMS 📨",    callback_data: "admin_manage_ranges" }],
        [{ text: "Stex SMS 📩",   callback_data: "placeholder_stex" }],
        [{ text: "MK SMS 💬",     callback_data: "placeholder_mk" }],
        [{ text: "Zenex SMS ⚡",  callback_data: "placeholder_zenex" }],
        [{ text: "NXA SMS 🟣",    callback_data: "placeholder_nxa" }], 
        [{ text: "Add Number ➕", callback_data: "admin_add_number_manual" }],
        [{ text: "⬅️ Back",       callback_data: "admin_manage_numbers" }]
    ]
};

function getAdminMenu(chatId) {
    let menu = [
        [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" },
         { text: "👥 User Access",       callback_data: "admin_user_access" }],
        [{ text: "⚙️ Manage Number",     callback_data: "admin_manage_numbers" },
         { text: "⚙️ Manage Panel",      callback_data: "admin_manage_panel" }]
    ];
    if (isSuperAdmin(chatId)) {
        menu.push([{ text: "👑 Manage Admins", callback_data: "admin_manage_admins" },
                   { text: "❌ Close Menu",    callback_data: "close_menu" }]);
    } else {
        menu.push([{ text: "❌ Close Menu", callback_data: "close_menu" }]);
    }
    return { inline_keyboard: menu };
}

function renderManageRangesMenu(chatId, messageId) {
    const platform    = tempAdminData[chatId]?.selectedPlatform || "fb";
    const rangesArray = tempAdminData[chatId]?.ranges || [];
    let rangeButtons  = [];

    rangesArray.forEach((r, index) => {
        let isAdded = db.availableNumbers[platform] &&
                      db.availableNumbers[platform][r.name] &&
                      db.availableNumbers[platform][r.name].length > 0;
        rangeButtons.push([{
            text: `${isAdded ? "✅" : "❌"} ${getCountryInfo(r.name).flag} ${r.name} (${r.nums.length})`,
            callback_data: `togglerng_${index}`
        }]);
    });

    rangeButtons.push([
        { text: "📥 Add All",      callback_data: "togglerng_addall" },
        { text: "🗑️ Remove All",   callback_data: "togglerng_delall" }
    ]);
    rangeButtons.push([
        { text: "🔄 Refresh List", callback_data: "refresh_manage_ranges" },
        { text: "⬅️ Back",         callback_data: "admin_sel_plat_fb" }
    ]);

    bot.editMessageText(
        `⚙️ **iVAS Manage Ranges (${platform.toUpperCase()}):**\n\nClick a range to manually toggle its availability:`,
        { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rangeButtons }, parse_mode: "Markdown" }
    ).catch(() => {});
}

function renderRemoveMenu(chatId, messageId) {
    let btns = [];
    let allRanges = [];

    ["fb", "ig", "wa"].forEach(plat => {
        const stexList = db.stexRanges[plat] ? Object.keys(db.stexRanges[plat]) : [];
        stexList.forEach(r => {
            const cName = typeof db.stexRanges[plat][r] === "object" ? db.stexRanges[plat][r].country : db.stexRanges[plat][r];
            allRanges.push({ plat, type: "stex", r, info: getCountryInfo(cName), prefix: "Stex" });
        });
        const mkList = db.mkRanges && db.mkRanges[plat] ? Object.keys(db.mkRanges[plat]) : [];
        mkList.forEach(r => {
            const cName = typeof db.mkRanges[plat][r] === "object" ? db.mkRanges[plat][r].country : db.mkRanges[plat][r];
            allRanges.push({ plat, type: "mk", r, info: getCountryInfo(cName), prefix: "MK" });
        });
        const zenexList = db.zenexRanges && db.zenexRanges[plat] ? Object.keys(db.zenexRanges[plat]) : [];
        zenexList.forEach(r => {
            const cName = typeof db.zenexRanges[plat][r] === "object" ? db.zenexRanges[plat][r].country : db.zenexRanges[plat][r];
            allRanges.push({ plat, type: "zenex", r, info: getCountryInfo(cName), prefix: "Zenex" });
        });
        const nxaList = db.nxaRanges && db.nxaRanges[plat] ? Object.keys(db.nxaRanges[plat]) : []; 
        nxaList.forEach(r => {
            const cName = typeof db.nxaRanges[plat][r] === "object" ? db.nxaRanges[plat][r].country : db.nxaRanges[plat][r];
            allRanges.push({ plat, type: "nxa", r, info: getCountryInfo(cName), prefix: "NXA" });
        });
        const ivaList = db.availableNumbers[plat] ? Object.keys(db.availableNumbers[plat]).filter(k => db.availableNumbers[plat][k].length > 0) : [];
        ivaList.forEach(r => {
            allRanges.push({ plat, type: "num", r, info: getCountryInfo(r), prefix: "IVA" });
        });
    });

    let globalCountryCount = {};
    allRanges.forEach(item => {
        globalCountryCount[item.info.cleanName] = (globalCountryCount[item.info.cleanName] || 0) + 1;
    });

    let currentV = {};
    allRanges.forEach(item => {
        let dName = `${item.info.flag} ${item.info.cleanName}`;
        if (globalCountryCount[item.info.cleanName] > 1) {
            currentV[item.info.cleanName] = (currentV[item.info.cleanName] || 0) + 1;
            dName += ` V${currentV[item.info.cleanName]}`;
        }
        let cbData = `del${item.type}rng_${item.plat}_${item.r}`;
        btns.push([{ text: `${item.prefix} : ${dName} (${item.r}) [${item.plat.toUpperCase()}]`, callback_data: cbData }]);
    });

    if (btns.length === 0) {
        bot.editMessageText("📭 No active numbers/ranges to remove.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]] } }).catch(() => {});
        return;
    }

    btns.push([{ text: "🗑️ REMOVE ALL", callback_data: "delall_everything" }]);
    btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]);
    
    bot.editMessageText("🗑️ **Select a range to remove:**\n_(This will delete the available numbers/ranges from the bot)_",
        { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }
    ).catch(() => {});
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    if (msg.chat.type !== "private") return;
    const chatId   = msg.chat.id;
    const username = msg.from.username;

    if (!await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);

    if (!db.users.includes(chatId)) {
        db.users.push(chatId);
        const refId = match[1];
        if (refId && Number(refId) !== chatId && !db.referred[chatId]) {
            db.referred[chatId] = Number(refId);
            addBalance(Number(refId), 10.00);
            bot.sendMessage(Number(refId),
                `🎉 **Congratulations!**\nA new user just joined using your referral link. 💰 **10.00 BDT** has been added to your balance.`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        }
        saveDB();
    }

    bot.sendMessage(chatId,
        `Welcome to the bot! 👋\n\nPlease select an option from the menu below to get started:`,
        { reply_markup: getReplyMenu(chatId, username) }
    ).catch(() => {});
});

bot.onText(/\/admin/, async (msg) => {
    if (msg.chat.type !== "private") return;
    if (!isAdmin(msg.chat.id, msg.from.username))
        return bot.sendMessage(msg.chat.id, "❌ Access Denied. You do not have the required admin rights.").catch(() => {});
    bot.sendMessage(msg.chat.id, "⚙️ **Admin Panel:**",
        { reply_markup: getAdminMenu(msg.chat.id), parse_mode: "Markdown" }
    ).catch(() => {});
});

bot.on("message", async (msg) => {
    if (msg.chat.type !== "private") return;

    const chatId   = msg.chat.id;
    const username = msg.from.username;
    const text     = msg.text || msg.caption || "";

    if (!db.users.includes(chatId)) { db.users.push(chatId); saveDB(); }

    if (userStates[chatId] === "WAITING_FOR_BROADCAST" && isAdmin(chatId, username)) {
        if (text === "✖ Close Menu" || text.startsWith("/")) {
            delete userStates[chatId];
            return;
        }
        bot.sendMessage(chatId, `⏳ Broadcasting your message to all users. Please wait...`).catch(() => {});
        let successCount = 0;
        
        if (!db.settings.lastBroadcast) db.settings.lastBroadcast = [];
        db.settings.lastBroadcast = []; 

        for (let uId of db.users) {
            try {
                let sentMsg = await bot.copyMessage(uId, chatId, msg.message_id, { reply_markup: { remove_keyboard: true } });
                db.settings.lastBroadcast.push({ chatId: uId, messageId: sentMsg.message_id.message_id || sentMsg.message_id });
                successCount++;
            } catch (e) {}
        }
        saveDB();

        bot.sendMessage(chatId, `✅ **Broadcast Complete!** Successfully sent to ${successCount} users.`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑️ Undo / Delete This Broadcast", callback_data: "admin_delete_broadcast" }]
                ]
            }
        }).catch(() => {});
        delete userStates[chatId];
        return;
    }

    if (!text || text.startsWith("/")) return;

   const restrictedWords = ["☎️ Get Number", "🔑 2FA", "👤 Profile", "💬 Support", "⚙️ Admin Panel", "📈 Live Traffic"];
    if ((restrictedWords.includes(text) || userStates[chatId]) && text !== "📧 Temp Mail" && !await isUserMember(msg.from.id)) {
        return sendJoinPrompt(chatId);
    }

    if (restrictedWords.includes(text) || text === "📧 Temp Mail") delete userStates[chatId];

    if (text === "☎️ Get Number") {
        clearPendingForChat(chatId);
        bot.sendMessage(chatId,
            `🛠 Please select the platform you want to receive an OTP for:`,
            { reply_markup: platformMenu }
        ).catch(() => {});
    }

    else if (text === "📧 Temp Mail") {
        try {
            if (activeTempMails[chatId]) {
                if (!activeTempMails[chatId].otpReceived && activeTempMails[chatId].messageId)
                    bot.deleteMessage(chatId, activeTempMails[chatId].messageId).catch(() => {});
                if (activeTempMails[chatId].interval) clearInterval(activeTempMails[chatId].interval);
                if (activeTempMails[chatId].timeout)  clearTimeout(activeTempMails[chatId].timeout);
            }

            const res   = await fetch("https://api.tempmail.lol/v2/inbox/create");
            if (!res.ok) throw new Error("API Server is currently unreachable.");
            const data  = await res.json();
            const email = data.address, token = data.token;

            const sentMsg  = await bot.sendMessage(chatId,
                `📧 **Your Temp Mail:**\n\`${email}\`\n\n📩 **SMS Status:** Waiting... ⏳`,
                { parse_mode: "Markdown" }
            );
            const messageId = sentMsg.message_id;

            activeTempMails[chatId] = { email, token, lastId: null, messageId, otpReceived: false };

            activeTempMails[chatId].interval = setInterval(async () => {
                try {
                    const inboxRes  = await fetch(`https://api.tempmail.lol/v2/inbox?token=${token}`);
                    const inboxData = await inboxRes.json();
                    if (inboxData.emails && inboxData.emails.length > 0) {
                        const latest = inboxData.emails[0];
                        const mailId = latest.date + latest.subject;
                        if (activeTempMails[chatId].lastId !== mailId) {
                            activeTempMails[chatId].lastId    = mailId;
                            activeTempMails[chatId].otpReceived = true;

                            const fullText  = `${latest.subject} ${latest.body || ""} ${latest.html || ""}`;
                            const plainText = fullText.replace(/<[^>]+>/g, " ");
                            let otpMatch    = plainText.match(/\b\d{4,8}\b/);
                            if (!otpMatch)  otpMatch = plainText.match(/\b[A-Z0-9]{5,10}\b/i);
                            const otp       = otpMatch ? otpMatch[0] : null;
                            const linkMatch = fullText.match(/https?:\/\/[^\s"'<>\\]+/);
                            const link      = linkMatch ? linkMatch[0] : null;
                            const platformName = detectPlatform(latest.from, latest.subject, plainText);

                            let cleanMessage = latest.subject.replace(/[\r\n]+/g, " ").trim();
                            if (cleanMessage.length < 10) {
                                let snippet = (latest.body || plainText).substring(0, 40).replace(/[\r\n]+/g, " ").trim();
                                cleanMessage += snippet ? " - " + snippet + "..." : "";
                            }

                            let replyText = `📧 **Your Temp Mail:**\n\`${email}\`\n\n📬 **New Email Received!**\n🌐 **Platform:** ${platformName}\n📝 **Message:** ${cleanMessage}`;
                            let markup = { inline_keyboard: [] };

                            if (otp) {
                                replyText += `\n\n🔑 **Code:** \`${otp}\``;
                                markup.inline_keyboard.push([{ text: `COPY OTP`, copy_text: { text: otp } }]);
                            } else if (link) {
                                replyText += `\n\n🔗 **Action Required:** This email contains a verification link.`;
                                markup.inline_keyboard.push([{ text: `🌐 Open Link`, url: link }]);
                            } else {
                                replyText += `\n\n⚠️ No specific verification code or link detected.`;
                            }

                            bot.editMessageText(replyText, {
                                chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
                                reply_markup: markup.inline_keyboard.length > 0 ? markup : null
                            }).catch(() => {});
                        }
                    }
                } catch (e) {}
            }, 3000);

            activeTempMails[chatId].timeout = setTimeout(() => {
                clearInterval(activeTempMails[chatId].interval);
                if (!activeTempMails[chatId].otpReceived) {
                    bot.editMessageText(
                        `📧 **Your Temp Mail:**\n\`${email}\`\n\n⚠️ **Session Expired (15m).**`,
                        { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
                    ).catch(() => {});
                }
            }, 15 * 60 * 1000);

        } catch (e) {
            bot.sendMessage(chatId,
                `❌ **Temp mail generation failed.**\n_Reason: ${e.message}_`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        }
    }

    else if (text === "👤 Profile") {
        bot.sendMessage(chatId,
            `👤 **Profile Info:**\n🆔 **User ID:** \`${chatId}\`\n📛 **Name:** ${msg.from.first_name || "N/A"}\n🎭 **Role:** ${isAdmin(chatId, username) ? (isSuperAdmin(chatId) ? "Super Admin 👑" : "Admin 🛡️") : "User 👤"}\n💰 **Balance:** ${getBalance(chatId).toFixed(2)} BDT\n\n🔗 **Referral Link:**\n\`https://t.me/${botInfo.username}?start=${chatId}\`\n_(Invite friends and earn 10 BDT for each new user!)_`,
            { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw", callback_data: "withdraw_funds" }]] } }
        ).catch(() => {});
    }

    else if (text === "🔑 2FA") {
        userStates[chatId] = "WAITING_FOR_2FA_KEY";
        bot.sendMessage(chatId,
            "🔐 **Send your secret key:**\n(For example: `RTOX IVWV MK7A 5R7C...`)",
            { parse_mode: "Markdown" }
        ).catch(() => {});
    }
    else if (userStates[chatId] === "WAITING_FOR_2FA_KEY") {
        try {
            const secret = text.replace(/\s+/g, "").toUpperCase();
            if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 10) throw new Error("Invalid");
            tempAdminData[chatId] = { active2FAKey: secret };
            bot.sendMessage(chatId,
                `🔐 **2FA Authenticator**\n━━━━━━━━━━\n🔑 **Code:** \`${authenticator.generate(secret)}\`\n🕒 **Refreshes in:** 30s\n━━━━━━━━━━\n_(Simply copy the code above and use it.)_`,
                { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh Code", callback_data: "refresh_2fa" }]] } }
            ).catch(() => {});
        } catch (err) {
            bot.sendMessage(chatId,
                "❌ **Invalid Secret Key!**\nPlease make sure you provided a valid format.",
                { parse_mode: "Markdown" }
            ).catch(() => {});
        }
        delete userStates[chatId];
    }

    else if (text === "💬 Support") {
        bot.sendMessage(chatId,
            "💬 <b>Support:</b>\nPlease contact our admin @ahnan_haque_mahi for any assistance.",
            { parse_mode: "HTML" }
        ).catch(() => {});
    }

            else if (text === "📈 Live Traffic") {
        const apiKey = db.zenexCookies;
        if (!apiKey) {
            return bot.sendMessage(chatId, "⚠️ **Panel is not logged in.**\nNo live traffic data available at the moment.", { parse_mode: "Markdown" }).catch(() => {});
        }
        bot.sendMessage(chatId, "⏳ **Fetching Live Traffic...**", { parse_mode: "Markdown" }).then(sentMsg => {
            zenex.getLiveTraffic(apiKey).then(routes => {
                if (!routes || routes.length === 0) {
                    return bot.editMessageText("📭 **No active routing traffic found right now.**", { chat_id: chatId, message_id: sentMsg.message_id, parse_mode: "Markdown" }).catch(() => {});
                }
                
                let replyText = "📈 **LIVE TRAFFIC**\n━━━━━━━━━━━━━━━━━━\n";
                routes.slice(0, 10).forEach(r => {
                    let cleanRange = String(r.range || "").replace(/X/g, "0");
                    let info = getCountryInfo(detectCountryFromRange(cleanRange));
                    
                    // Removed panel name and range, kept only Country, Platform, and Hits
                    replyText += `🌍 **Country:** ${info.flag} ${info.cleanName}\n`;
                    replyText += `🌐 **Platform:** ${r.service}\n`;
                    replyText += `🔥 **Hits:** ${r.hits}\n━━━━━━━━━━━━━━━━━━\n`;
                });
                
                bot.editMessageText(replyText, { chat_id: chatId, message_id: sentMsg.message_id, parse_mode: "Markdown" }).catch(() => {});
            }).catch(e => {
                bot.editMessageText("❌ **Failed to fetch traffic data.**", { chat_id: chatId, message_id: sentMsg.message_id, parse_mode: "Markdown" }).catch(() => {});
            });
        });
    }

    else if (text === "⚙️ Admin Panel" && isAdmin(chatId, username)) {
        bot.sendMessage(chatId, "⚙️ **Admin Panel:**",
            { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }
        ).catch(() => {});
    }

    else if (userStates[chatId] === "WAITING_FOR_LIMIT" && isAdmin(chatId, username)) {
        const limit = parseInt(text);
        if (isNaN(limit) || limit < 1 || limit > 20) {
            bot.sendMessage(chatId, "❌ Invalid input. Please enter a valid number between 1 and 20.").catch(() => {});
        } else {
            db.settings.maxNumbers = limit;
            saveDB();
            bot.sendMessage(chatId, `✅ Successfully updated! Users will now be assigned **${limit}** numbers at a time.`).catch(() => {});
            bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) }).catch(() => {});
            delete userStates[chatId];
        }
    }

    else if (userStates[chatId] === "WAITING_FOR_MANUAL_COUNTRY" && isAdmin(chatId, username)) {
        const info = getCountryInfo(text.trim().toUpperCase());
        tempAdminData[chatId] = { ...tempAdminData[chatId], addNumberCountry: text.trim().toUpperCase() };
        userStates[chatId]    = "WAITING_FOR_ADD_NUMBERS";
        bot.sendMessage(chatId,
            `✅ **Country Selected:** ${info.flag} ${info.cleanName}\n\nPlease paste the numbers below (each on a new line):`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
    }

    else if (userStates[chatId] === "WAITING_FOR_ADD_NUMBERS" && isAdmin(chatId, username)) {
        const country  = tempAdminData[chatId]?.addNumberCountry;
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        if (!country) { delete userStates[chatId]; return; }

        const numbers = text.split("\n").map(n => n.trim()).filter(n => n.length > 0);
        if (!db.availableNumbers[platform])          db.availableNumbers[platform] = {};
        if (!db.availableNumbers[platform][country]) db.availableNumbers[platform][country] = [];

        let added = 0;
        numbers.forEach(num => {
            if (!db.availableNumbers[platform][country].includes(num)) {
                db.availableNumbers[platform][country].push(num);
                added++;
            }
        });
        saveDB();
        bot.sendMessage(chatId,
            `✅ Success! **${added}** numbers have been successfully added to ${country} for **${platform.toUpperCase()}**.`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.sendMessage(chatId, "⚙️ **Manage Panel:**", { reply_markup: manageNumberPanel }).catch(() => {});
        delete userStates[chatId];
        delete tempAdminData[chatId];
    }

    else if (userStates[chatId] === "WAITING_FOR_BKASH") {
        if (/^(01[3-9]\d{8})$/.test(text)) {
            const currentBalance = getBalance(chatId);
            if (currentBalance < 50) {
                bot.sendMessage(chatId, `⚠️ Insufficient balance. You need at least 50 BDT to withdraw.`).catch(() => {});
                delete userStates[chatId];
                return;
            }
            bot.sendMessage(ADMIN_ID,
                `💸 **New Withdraw Request!**\n\n👤 **User ID:** \`${chatId}\`\n📞 **Account:** \`${text}\`\n💰 **Amount:** ${currentBalance.toFixed(2)} BDT`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
            bot.sendMessage(chatId, `✅ Your withdrawal request has been submitted successfully and is pending review.`).catch(() => {});
            db.balances[chatId] = 0;
            saveDB();
            delete userStates[chatId];
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Please enter a valid 11-digit account number.").catch(() => {});
        }
    }

    else if (userStates[chatId] === "WAITING_FOR_ADMIN_USERNAME" && isSuperAdmin(chatId)) {
        let newAdmin = text.trim().toLowerCase();
        if (!newAdmin.startsWith("@")) newAdmin = "@" + newAdmin;
        if (!db.adminUsernames.includes(newAdmin)) {
            db.adminUsernames.push(newAdmin);
            saveDB();
            bot.sendMessage(chatId, `✅ **${newAdmin}** has been successfully added as an admin.`).catch(() => {});
        }
        bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }).catch(() => {});
        delete userStates[chatId];
    }

    else if (userStates[chatId] === "WAITING_FOR_STEX_CREDS" && isAdmin(chatId, username)) {
        const parts = text.split("|");
        if (parts.length === 2) {
            let email    = parts[0].trim();
            let password = parts[1].trim();
            bot.sendMessage(chatId, "⏳ Logging into StexSMS...").catch(() => {});
            stex.login(email, password).then(token => {
                db.stexToken = token;
                db.stexCreds = { email, password };
                if (!db.savedStexAccounts) db.savedStexAccounts = [];
                let existing = db.savedStexAccounts.find(a => a.email === email);
                if (existing) existing.password = password;
                else {
                    db.savedStexAccounts.push({ email, password });
                    if (db.savedStexAccounts.length > 5) db.savedStexAccounts.shift();
                }
                saveDB();
                bot.sendMessage(chatId, "✅ Stex Login Successful! Account saved.").catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Use `email|password`").catch(() => {});
        }
        delete userStates[chatId];
    }
    else if (userStates[chatId] === "WAITING_FOR_MK_CREDS" && isAdmin(chatId, username)) {
        const parts = text.split("|");
        if (parts.length === 2) {
            let email    = parts[0].trim();
            let password = parts[1].trim();
            bot.sendMessage(chatId, "⏳ Logging into MK SMS Server...").catch(() => {});
            mk.login(email, password).then(cookieStr => {
                db.mkCookies = cookieStr;
                db.mkCreds   = { email, password };
                if (!db.savedMkAccounts) db.savedMkAccounts = [];
                let existing = db.savedMkAccounts.find(a => a.email === email);
                if (existing) existing.password = password;
                else {
                    db.savedMkAccounts.push({ email, password });
                    if (db.savedMkAccounts.length > 5) db.savedMkAccounts.shift();
                }
                saveDB();
                bot.sendMessage(chatId, "✅ MK SMS Login Successful! Account saved.", { parse_mode: "Markdown" }).catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ **Failed:** " + e.message, { parse_mode: "Markdown" }).catch(() => {}));
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Use `email|password`").catch(() => {});
        }
        delete userStates[chatId];
    }
    else if (userStates[chatId] === "WAITING_FOR_ZENEX_CREDS" && isAdmin(chatId, username)) {
        const parts = text.split("|");
        if (parts.length === 2) {
            let email    = parts[0].trim();
            let password = parts[1].trim();
            bot.sendMessage(chatId, "⏳ Logging into Zenex SMS Server...").catch(() => {});
            zenex.login(email, password).then(cookieStr => {
                db.zenexCookies = cookieStr;
                db.zenexCreds   = { email, password };
                if (!db.savedZenexAccounts) db.savedZenexAccounts = [];
                let existing = db.savedZenexAccounts.find(a => a.email === email);
                if (existing) existing.password = password;
                else {
                    db.savedZenexAccounts.push({ email, password });
                    if (db.savedZenexAccounts.length > 5) db.savedZenexAccounts.shift();
                }
                saveDB();
                bot.sendMessage(chatId, "✅ Zenex SMS Login Successful! Account saved.", { parse_mode: "Markdown" }).catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ **Failed:** " + e.message, { parse_mode: "Markdown" }).catch(() => {}));
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Use `email|password`").catch(() => {});
        }
        delete userStates[chatId];
    }
    else if (userStates[chatId] === "WAITING_FOR_NXA_CREDS" && isAdmin(chatId, username)) {
        const parts = text.split("|");
        if (parts.length === 2) {
            let email    = parts[0].trim();
            let password = parts[1].trim();
            bot.sendMessage(chatId, "⏳ Logging into NXA SMS Server...").catch(() => {});
            nxa.login(email, password).then(authData => {
                db.nxaToken   = authData.token;
                db.nxaCookies = authData.cookie;
                db.nxaCreds   = { email, password };
                if (!db.savedNxaAccounts) db.savedNxaAccounts = [];
                let existing = db.savedNxaAccounts.find(a => a.email === email);
                if (existing) existing.password = password;
                else {
                    db.savedNxaAccounts.push({ email, password });
                    if (db.savedNxaAccounts.length > 5) db.savedNxaAccounts.shift();
                }
                saveDB();
                bot.sendMessage(chatId, "✅ NXA SMS Login Successful! Account saved.", { parse_mode: "Markdown" }).catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ **Failed:** " + e.message, { parse_mode: "Markdown" }).catch(() => {}));
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Use `email|password`").catch(() => {});
        }
        delete userStates[chatId];
    }

    else if (userStates[chatId] === "WAITING_FOR_STEX_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "stex" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId, `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**`, { parse_mode: "Markdown" }).catch(() => {});
        } else bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
    }
    else if (userStates[chatId] === "WAITING_FOR_MK_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "mk" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId, `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**`, { parse_mode: "Markdown" }).catch(() => {});
        } else bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
    }
    else if (userStates[chatId] === "WAITING_FOR_ZENEX_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "zenex" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId, `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**`, { parse_mode: "Markdown" }).catch(() => {});
        } else bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
    }
    else if (userStates[chatId] === "WAITING_FOR_NXA_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "nxa" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId, `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**`, { parse_mode: "Markdown" }).catch(() => {});
        } else bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
    }

    else if (userStates[chatId] === "WAITING_FOR_METHOD_NAME" && isAdmin(chatId, username)) {
        const method   = text.trim();
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        const range    = tempAdminData[chatId]?.pendingRange;
        const country  = tempAdminData[chatId]?.pendingCountry;
        const panel    = tempAdminData[chatId]?.pendingPanel;

        if (panel === "stex") {
            if (!db.stexRanges[platform]) db.stexRanges[platform] = {};
            db.stexRanges[platform][range] = { country, method };
        } else if (panel === "mk") {
            if (!db.mkRanges[platform]) db.mkRanges[platform] = {};
            db.mkRanges[platform][range] = { country, method };
        } else if (panel === "zenex") { 
            if (!db.zenexRanges) db.zenexRanges = { fb: {}, ig: {}, wa: {} };
            if (!db.zenexRanges[platform]) db.zenexRanges[platform] = {};
            db.zenexRanges[platform][range] = { country, method };
        } else if (panel === "nxa") {
            if (!db.nxaRanges) db.nxaRanges = { fb: {}, ig: {}, wa: {} };
            if (!db.nxaRanges[platform]) db.nxaRanges[platform] = {};
            db.nxaRanges[platform][range] = { country, method };
        }
        
        saveDB();
        bot.sendMessage(chatId, `✅ Successfully added ${panel.toUpperCase()} Range **${range}** for **${platform.toUpperCase()}**.\n🌍 Country: **${country}**\n📝 Method: **${method}**`, { parse_mode: "Markdown" }).catch(() => {});

        delete userStates[chatId];
        if (tempAdminData[chatId]) {
            delete tempAdminData[chatId].pendingRange;
            delete tempAdminData[chatId].pendingCountry;
            delete tempAdminData[chatId].pendingPanel;
        }
    }
});

bot.on("callback_query", async (query) => {
    if (query.message.chat.type !== "private") return;

    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const data      = query.data;
    const username  = query.from.username;

    if (data === "check_join") {
        if (await isUserMember(query.from.id)) {
            bot.deleteMessage(chatId, messageId).catch(() => {});
            bot.sendMessage(chatId, `Welcome! 👋`, { reply_markup: getReplyMenu(chatId, username) }).catch(() => {});
            return bot.answerCallbackQuery(query.id, { text: "✅ Thank you for joining! You can now use the bot." });
        }
        return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined all groups yet. Please join first!", show_alert: true });
    }

    if (!await isUserMember(query.from.id))
        return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined all groups yet.", show_alert: true });

    const adminActs = ["admin_", "togglerng_", "refresh_", "deladmin_", "addnum_",
                       "placeholder_stex", "stex_", "stexdel_", "placeholder_mk", "mk_",
                       "placeholder_zenex", "zenex_", "zenexdel_", "delzenexrng_", 
                       "placeholder_nxa", "nxa_", "nxadel_", "delnxarng_",
                       "placeholder_iva", "delnumrng_", "delstexrng_", "delmkrng_", "delall_"];
    if (adminActs.some(a => data.startsWith(a)) && !isAdmin(chatId, username) && data !== "refresh_2fa")
        return bot.answerCallbackQuery(query.id, { text: "❌ Permission Denied! You do not have admin access for this action.", show_alert: true });

    if (data === "close_menu") {
        bot.deleteMessage(chatId, messageId).catch(() => {});
        return bot.answerCallbackQuery(query.id);
    }
    
    else if (data === "refresh_2fa") {
        const secret = tempAdminData[chatId]?.active2FAKey;
        if (!secret) return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired! Please generate a new code.", show_alert: true });
        try {
            bot.editMessageText(
                `🔐 **2FA Authenticator**\n━━━━━━━━━━\n🔑 **Code:** \`${authenticator.generate(secret)}\`\n🕒 **Refreshes in:** 30s\n━━━━━━━━━━\n_(Simply copy the code above and use it.)_`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
                  reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh Code", callback_data: "refresh_2fa" }]] } }
            ).catch(() => {});
            bot.answerCallbackQuery(query.id, { text: "🔄 Code refreshed successfully!" });
        } catch (e) {
            bot.answerCallbackQuery(query.id, { text: "❌ Error refreshing the code." });
        }
    }

    else if (data === "admin_panel") {
        bot.editMessageText("⚙️ **Admin Panel:**",
            { chat_id: chatId, message_id: messageId, reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_broadcast") {
        userStates[chatId] = "WAITING_FOR_BROADCAST";
        bot.sendMessage(chatId,
            "📢 **Please send the message you want to broadcast:**\n_(You can send Text, Photo, Video, Voice, or Document)_",
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_delete_broadcast") {
        if (!isAdmin(chatId, username)) return bot.answerCallbackQuery(query.id, { text: "❌ Permission Denied!", show_alert: true });

        const lastBroadcastData = db.settings.lastBroadcast || [];
        if (lastBroadcastData.length === 0) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ No recent broadcast found or it's already deleted.", show_alert: true });
        }

        bot.editMessageText("⏳ **Deleting broadcasted messages...** Please wait.", { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(() => {});
        
        let deletedCount = 0;
        for (let record of lastBroadcastData) {
            try {
                await bot.deleteMessage(record.chatId, record.messageId);
                deletedCount++;
            } catch (e) {}
        }

        db.settings.lastBroadcast = [];
        saveDB();

        bot.editMessageText(`✅ **Broadcast Deleted Successfully!**\nRemoved from ${deletedCount} users' chats.`, { 
            chat_id: chatId, 
            message_id: messageId, 
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Admin Panel", callback_data: "admin_panel" }]] }
        }).catch(() => {});
        
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_user_access") {
        bot.editMessageText("👥 **User Access Management:**\nControl constraints for the users.", {
            chat_id: chatId, message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔢 Set Number Limit", callback_data: "admin_set_limit" }],
                    [{ text: "⬅️ Back", callback_data: "admin_panel" }]
                ]
            }, parse_mode: "Markdown"
        }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_set_limit") {
        userStates[chatId] = "WAITING_FOR_LIMIT";
        bot.sendMessage(chatId, `🔢 **Please enter the new number limit:**`).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_manage_panel") {
        bot.editMessageText("⚙️ **Login to panel :**", {
            chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [
                [{ text: "IVA SMS 📩",  callback_data: "placeholder_iva" }],
                [{ text: "Stex SMS 📨", callback_data: "stex_login" }],
                [{ text: "MK SMS ✉️",  callback_data: "placeholder_mk_login" }],
                [{ text: "Zenex SMS ⚡", callback_data: "zenex_login" }], 
                [{ text: "NXA SMS 🟣", callback_data: "nxa_login" }], 
                [{ text: "⬅️ Back",     callback_data: "admin_panel" }]
            ]}
        }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (["zenex_login", "stex_login", "placeholder_mk_login", "nxa_login"].includes(data)) {
        let panel = data.replace("_login", "").replace("placeholder_", "");
        let savedAccounts = db[`saved${panel.charAt(0).toUpperCase() + panel.slice(1)}Accounts`] || [];
        let activeCreds = db[`${panel}Creds`];
        let btns = [];

        if (savedAccounts.length > 0) {
            savedAccounts.forEach((acc, idx) => {
                let activeMark = (activeCreds && activeCreds.email === acc.email) ? "✅ " : "👤 ";
                btns.push([{ text: `${activeMark}${acc.email}`, callback_data: `${panel}_qlogin_${idx}` }]);
            });
            btns.push([{ text: "Remove Account", callback_data: `${panel}_remove_menu` }]);
        }
        btns.push([{ text: "Add Account", callback_data: `${panel}_manual_login` }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_panel" }]);
        
        bot.editMessageText(`🔑 **${panel.toUpperCase()} SMS Login:**\nChoose an account to login or add a new one:`,
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.endsWith("_remove_menu")) {
        let panel = data.replace("_remove_menu", "");
        let savedAccounts = db[`saved${panel.charAt(0).toUpperCase() + panel.slice(1)}Accounts`] || [];
        let btns = [];
        savedAccounts.forEach((acc, idx) => {
            btns.push([{ text: `❌ ${acc.email}`, callback_data: `${panel}_delacc_${idx}` }]);
        });
        let backData = panel === "mk" ? "placeholder_mk_login" : `${panel}_login`;
        btns.push([{ text: "⬅️ Back", callback_data: backData }]);
        
        bot.editMessageText("🗑️ **Select an account to remove:**",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.includes("_delacc_")) {
        let [panel, , idxStr] = data.split("_");
        let idx = parseInt(idxStr);
        let savedKey = `saved${panel.charAt(0).toUpperCase() + panel.slice(1)}Accounts`;
        let acc = db[savedKey][idx];
        
        if (acc) {
            if (db[`${panel}Creds`] && db[`${panel}Creds`].email === acc.email) {
                db[`${panel}Creds`] = null;
                if(panel === "stex" || panel === "nxa") db[`${panel}Token`] = "";
                if(panel === "mk" || panel === "zenex" || panel === "nxa") db[`${panel}Cookies`] = "";
            }
            db[savedKey].splice(idx, 1);
            saveDB();
            bot.answerCallbackQuery(query.id, { text: "✅ Account removed successfully!" });
        } else {
            bot.answerCallbackQuery(query.id);
        }
        let backData = panel === "mk" ? "placeholder_mk_login" : `${panel}_login`;
        bot.editMessageText(`🔑 **${panel.toUpperCase()} SMS Login:**`, 
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: backData }]] } }
        ).catch(() => {});
    }

    else if (data.endsWith("_manual_login")) {
        let panel = data.replace("_manual_login", "");
        userStates[chatId] = `WAITING_FOR_${panel.toUpperCase()}_CREDS`;
        bot.sendMessage(chatId, `📧 **Send ${panel.toUpperCase()} credentials format:**\n\`email|password\``, { parse_mode: "Markdown" }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.includes("_qlogin_")) {
        let [panel, , idxStr] = data.split("_");
        let idx = parseInt(idxStr);
        let savedKey = `saved${panel.charAt(0).toUpperCase() + panel.slice(1)}Accounts`;
        const acc = db[savedKey][idx];
        
        if (acc) {
            bot.sendMessage(chatId, `⏳ Logging into ${panel.toUpperCase()} SMS...`).catch(() => {});
            
            if (panel === "stex") {
                stex.login(acc.email, acc.password).then(token => { db.stexToken = token; db.stexCreds = acc; saveDB(); bot.sendMessage(chatId, "✅ Stex Login Successful!").catch(() => {}); }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
            } else if (panel === "mk") {
                mk.login(acc.email, acc.password).then(c => { db.mkCookies = c; db.mkCreds = acc; saveDB(); bot.sendMessage(chatId, "✅ MK Login Successful!").catch(() => {}); }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
            } else if (panel === "zenex") {
                zenex.login(acc.email, acc.password).then(c => { db.zenexCookies = c; db.zenexCreds = acc; saveDB(); bot.sendMessage(chatId, "✅ Zenex Login Successful!").catch(() => {}); }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
            } else if (panel === "nxa") {
                nxa.login(acc.email, acc.password).then(auth => { db.nxaToken = auth.token; db.nxaCookies = auth.cookie; db.nxaCreds = acc; saveDB(); bot.sendMessage(chatId, "✅ NXA Login Successful!").catch(() => {}); }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
            }
        }
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_manage_numbers") {
        bot.editMessageText("🛠 **Please select the platform for managing numbers:**",
            { chat_id: chatId, message_id: messageId, reply_markup: adminPlatformMenu }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("admin_sel_plat_")) {
        tempAdminData[chatId] = { ...tempAdminData[chatId], selectedPlatform: data.split("_")[3] };
        bot.editMessageText(`🛠 Manage ${data.split("_")[3].toUpperCase()} Panel:`,
            { chat_id: chatId, message_id: messageId, reply_markup: manageNumberPanel }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_add_number_manual") {
        userStates[chatId] = "WAITING_FOR_MANUAL_COUNTRY";
        bot.sendMessage(chatId,
            "🌍 **Enter the country name:**\n(For example: PAKISTAN, USA, BANGLADESH)",
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("placeholder_")) {
        let panel = data.replace("placeholder_", "");
        if (panel === "iva") {
            return bot.answerCallbackQuery(query.id, { text: "🛠 This service/logic is not integrated yet.", show_alert: true });
        }
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        userStates[chatId] = `WAITING_FOR_${panel.toUpperCase()}_RANGE`;
        bot.sendMessage(chatId,
            `🔢 **Enter ${panel.toUpperCase()} Range for ${platform.toUpperCase()}:**\nJust type the range, the bot will automatically detect the country.\nExample: \`23276XXX\``,
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_remove_number_menu") {
        renderRemoveMenu(chatId, messageId);
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "delall_everything") {
        db.stexRanges = { fb: {}, ig: {}, wa: {} };
        db.mkRanges   = { fb: {}, ig: {}, wa: {} };
        db.zenexRanges = { fb: {}, ig: {}, wa: {} }; 
        db.nxaRanges   = { fb: {}, ig: {}, wa: {} }; 
        db.availableNumbers = { fb: {}, ig: {}, wa: {} };
        saveDB();
        bot.answerCallbackQuery(query.id, { text: "✅ All Numbers and Ranges removed successfully!", show_alert: true });
        bot.editMessageText("🗑️ **All numbers/ranges have been removed.**",
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]] }, parse_mode: "Markdown" }
        ).catch(() => {});
    }

    else if (data.startsWith("delnumrng_") || data.startsWith("delstexrng_") || data.startsWith("delmkrng_") || data.startsWith("delzenexrng_") || data.startsWith("delnxarng_")) {
        const isStex    = data.startsWith("delstexrng_");
        const isMk      = data.startsWith("delmkrng_");
        const isZenex   = data.startsWith("delzenexrng_"); 
        const isNxa     = data.startsWith("delnxarng_");
        
        const prefixStr = isStex ? "delstexrng_" : (isMk ? "delmkrng_" : (isZenex ? "delzenexrng_" : (isNxa ? "delnxarng_" : "delnumrng_")));
        const payload   = data.replace(prefixStr, "");
        const parts     = payload.split("_");
        const plat      = parts[0];
        const target    = parts.slice(1).join("_");

        if (isStex) {
            if (db.stexRanges[plat] && db.stexRanges[plat][target]) { delete db.stexRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ Stex range ${target} removed!` });
        } else if (isMk) {
            if (db.mkRanges && db.mkRanges[plat] && db.mkRanges[plat][target]) { delete db.mkRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ MK range ${target} removed!` });
        } else if (isZenex) {
            if (db.zenexRanges && db.zenexRanges[plat] && db.zenexRanges[plat][target]) { delete db.zenexRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ Zenex range ${target} removed!` });
        } else if (isNxa) {
            if (db.nxaRanges && db.nxaRanges[plat] && db.nxaRanges[plat][target]) { delete db.nxaRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ NXA range ${target} removed!` });
        } else {
            if (db.availableNumbers[plat] && db.availableNumbers[plat][target]) { delete db.availableNumbers[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ ${target} numbers removed!` });
        }

        renderRemoveMenu(chatId, messageId);
    }

    else if (data === "admin_manage_ranges" || data === "refresh_manage_ranges") {
        bot.answerCallbackQuery(query.id, { text: "🔄 Loading data from extension..." });
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        if (!db.availableNumbers[platform]) db.availableNumbers[platform] = {};
        let grouped = { ...latestRangesFromExtension };
        for (const r in db.availableNumbers[platform]) {
            if (!grouped[r]) grouped[r] = db.availableNumbers[platform][r];
        }
        tempAdminData[chatId] = { ...tempAdminData[chatId], ranges: Object.keys(grouped).map(r => ({ name: r, nums: grouped[r] })) };
        if (tempAdminData[chatId].ranges.length === 0)
            return bot.editMessageText("📭 **No data found!** Please ensure your browser extension is active.",
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_sel_plat_fb" }]] }, parse_mode: "Markdown" }
            ).catch(() => {});
        renderManageRangesMenu(chatId, messageId);
    }

    else if (data.startsWith("togglerng_")) {
        const action   = data.replace("togglerng_", "");
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        if (!db.availableNumbers[platform]) db.availableNumbers[platform] = {};
        if (!tempAdminData[chatId]?.ranges)
            return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired! Please fetch ranges again.", show_alert: true });

        if (action === "addall") {
            let t = 0;
            tempAdminData[chatId].ranges.forEach(r => {
                if (!db.availableNumbers[platform][r.name]) db.availableNumbers[platform][r.name] = [];
                r.nums.forEach(num => {
                    if (!db.availableNumbers[platform][r.name].includes(num) && !inUseNumbers[num]) {
                        db.availableNumbers[platform][r.name].push(num); t++;
                    }
                });
            });
            saveDB();
            bot.answerCallbackQuery(query.id, { text: `✅ Successfully added all ${t} available numbers.` });
        } else if (action === "delall") {
            tempAdminData[chatId].ranges.forEach(r => { delete db.availableNumbers[platform][r.name]; });
            saveDB();
            bot.answerCallbackQuery(query.id, { text: `🗑️ Successfully removed all numbers from the active list.` });
        } else {
            const idx = parseInt(action);
            const sel = tempAdminData[chatId].ranges[idx];
            if (db.availableNumbers[platform][sel.name]) {
                delete db.availableNumbers[platform][sel.name];
                saveDB();
                bot.answerCallbackQuery(query.id, { text: `❌ Removed range from active list.` });
            } else {
                db.availableNumbers[platform][sel.name] = [];
                let a = 0;
                sel.nums.forEach(num => {
                    if (!inUseNumbers[num]) { db.availableNumbers[platform][sel.name].push(num); a++; }
                });
                saveDB();
                bot.answerCallbackQuery(query.id, { text: `✅ Added range successfully (${a} numbers).` });
            }
        }
        renderManageRangesMenu(chatId, messageId);
    }

    else if (data === "admin_manage_admins") {
        if (!isSuperAdmin(chatId)) return;
        bot.editMessageText("👑 **Manage Admins:**\nSelect an option to add or remove bot administrators.",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [
                [{ text: "➕ Add Admin", callback_data: "admin_add_admin" },
                 { text: "➖ Remove",    callback_data: "admin_remove_admin" }],
                [{ text: "⬅️ Back",     callback_data: "admin_panel" }]
            ]}}
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_add_admin") {
        if (!isSuperAdmin(chatId)) return;
        userStates[chatId] = "WAITING_FOR_ADMIN_USERNAME";
        bot.sendMessage(chatId, "👤 **Please enter the Telegram Username you wish to make an admin:**").catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "admin_remove_admin") {
        if (!isSuperAdmin(chatId)) return;
        if (db.adminUsernames.length === 0)
            return bot.answerCallbackQuery(query.id, { text: "📭 No admins found in the system.", show_alert: true });
        let btns = db.adminUsernames.map(un => [{ text: `❌ Remove ${un}`, callback_data: `deladmin_${un}` }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_admins" }]);
        bot.editMessageText("🗑️ **Select an administrator to remove:**",
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("deladmin_")) {
        if (!isSuperAdmin(chatId)) return;
        let unToRemove = data.replace("deladmin_", "");
        db.adminUsernames = db.adminUsernames.filter(u => u !== unToRemove);
        saveDB();
        bot.answerCallbackQuery(query.id, { text: `✅ Admin successfully removed!`, show_alert: true });
        bot.editMessageText("👑 **Manage Admins:**\nSelect an option to add or remove bot administrators.",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [
                [{ text: "➕ Add Admin", callback_data: "admin_add_admin" },
                 { text: "➖ Remove",    callback_data: "admin_remove_admin" }],
                [{ text: "⬅️ Back",     callback_data: "admin_panel" }]
            ]}}
        ).catch(() => {});
    }

    else if (data === "withdraw_funds") {
        userStates[chatId] = "WAITING_FOR_BKASH";
        bot.sendMessage(chatId, "💸 **Please enter your 11-digit bKash or Nagad number:**").catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "menu_platform") {
        clearPendingForChat(chatId);
        bot.editMessageText(`Please select the platform:`,
            { chat_id: chatId, message_id: messageId, reply_markup: platformMenu }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("menu_country_")) {
        clearPendingForChat(chatId);
        const platform        = data.replace("menu_country_", "");
        const availPlatformDB = db.availableNumbers[platform] || {};
        
        const finalStexDB = db.stexRanges[platform] || {};
        const finalMkDB   = db.mkRanges?.[platform] || {};
        const finalZenexDB= db.zenexRanges?.[platform] || {};
        const finalNxaDB  = db.nxaRanges?.[platform] || {};

        const ranges         = Object.keys(availPlatformDB).filter(k => availPlatformDB[k].length > 0);
        const stexRangesList = Object.keys(finalStexDB);
        const mkRangesList   = Object.keys(finalMkDB);
        const zenexRangesList= Object.keys(finalZenexDB);
        const nxaRangesList  = Object.keys(finalNxaDB);

        if (ranges.length === 0 && stexRangesList.length === 0 && mkRangesList.length === 0 && zenexRangesList.length === 0 && nxaRangesList.length === 0)
            return bot.editMessageText(`⚠️ We are currently out of stock for this platform. Please check back later.`,
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "menu_platform" }]] } }
            ).catch(() => {});

        let combinedRanges = [];
        ranges.forEach(r       => combinedRanges.push({ type: "iva",  range: r, info: getCountryInfo(r) }));
        stexRangesList.forEach(r => combinedRanges.push({ type: "stex", range: r, info: getCountryInfo(typeof finalStexDB[r] === "object" ? finalStexDB[r].country : finalStexDB[r]) }));
        mkRangesList.forEach(r   => combinedRanges.push({ type: "mk",   range: r, info: getCountryInfo(typeof finalMkDB[r]   === "object" ? finalMkDB[r].country   : finalMkDB[r]) }));
        zenexRangesList.forEach(r=> combinedRanges.push({ type: "zenex",range: r, info: getCountryInfo(typeof finalZenexDB[r]=== "object" ? finalZenexDB[r].country : finalZenexDB[r]) })); 
        nxaRangesList.forEach(r  => combinedRanges.push({ type: "nxa",  range: r, info: getCountryInfo(typeof finalNxaDB[r]  === "object" ? finalNxaDB[r].country : finalNxaDB[r]) })); 
        
        combinedRanges.sort((a, b) => a.info.cleanName.localeCompare(b.info.cleanName));

        let globalCountryCount = {};
        combinedRanges.forEach(item => {
            globalCountryCount[item.info.cleanName] = (globalCountryCount[item.info.cleanName] || 0) + 1;
        });

        let currentV = {}, countryButtons = [];
        combinedRanges.forEach(item => {
            let info  = item.info;
            let dName = `${info.flag} ${info.cleanName}`;
            if (globalCountryCount[info.cleanName] > 1) {
                currentV[info.cleanName] = (currentV[info.cleanName] || 0) + 1;
                dName += ` V${currentV[info.cleanName]}`;
            }
            let stock = item.type === "iva" ? availPlatformDB[item.range].length : "∞";            
            countryButtons.push([{ text: `${dName} | 📦: ${stock}`, callback_data: `assign_${item.type}_${platform}_${item.range}` }]);
        });
        countryButtons.push([{ text: "✖ Close Menu", callback_data: "close_menu" }, { text: "⬅️ Back", callback_data: "menu_platform" }]);
        bot.editMessageText(`🌍 Select a country from the available options:`,
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: countryButtons } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("assign_")) {
        if (activeNumberMessages[chatId] && activeNumberMessages[chatId] !== messageId)
            bot.deleteMessage(chatId, activeNumberMessages[chatId]).catch(() => {});
        delete activeNumberMessages[chatId];
        const pureData = data.replace("assign_next_", "").replace("assign_", "");
        const parts    = pureData.split("_");
        const panelType= parts[0];  
        const platform = parts[1];  
        const sel      = parts.slice(2).join("_");

        clearPendingForChat(chatId);

        let zenexEntry = db.zenexRanges?.[platform]?.[sel];
        let stexEntry = db.stexRanges?.[platform]?.[sel];
        let mkEntry = db.mkRanges?.[platform]?.[sel];
        let nxaEntry = db.nxaRanges?.[platform]?.[sel];

        if (panelType === "nxa" && nxaEntry) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const countryName = typeof nxaEntry === "object" ? nxaEntry.country : nxaEntry;
            const methodName  = typeof nxaEntry === "object" ? nxaEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(() => {});
            
            const tokenToUse = db.nxaToken;
            const cookieToUse = db.nxaCookies;
            const credsToUse = db.nxaCreds;

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await nxa.getNumber(sel, tokenToUse, cookieToUse);
                    const n = numData.number ? numData.number.replace("+", "") : "";
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, carrier: methodName, isNxa: true, platform, token: tokenToUse, cookie: cookieToUse, internal_id: numData.internal_id, createdAt: Date.now() };
                        ConsoleLog.create({ number: n, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                    }
                } catch (e) {
                    if (i === 0 && credsToUse?.email) {
                        try {
                            const authData = await nxa.login(credsToUse.email, credsToUse.password);
                            db.nxaToken = authData.token; db.nxaCookies = authData.cookie;
                            saveDB();
                            const retryData = await nxa.getNumber(sel, authData.token, authData.cookie);
                            const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                            if (retryN) { 
                                fetchedNums.push(retryN); 
                                inUseNumbers[retryN] = true; 
                                pendingRequests[retryN] = { chatId, country: countryName, carrier: methodName, isNxa: true, platform, token: authData.token, cookie: authData.cookie, internal_id: retryData.internal_id, createdAt: Date.now() }; 
                                ConsoleLog.create({ number: retryN, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                                continue; 
                            }
                        } catch (err2) { break; }
                    }
                    break;
                }
            }
            syncPending();

            if (fetchedNums.length === 0)
                return bot.editMessageText(`❌ Out of stock or error fetching the number.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }).catch(() => {});

            const info    = getCountryInfo(countryName);
            let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
            let replyText = `🤖 **${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
            if (methodName) replyText += `\n📝 **Method:** ${methodName}`;
            replyText += `\n\n👇 _Click a number below to copy:_`;

            let actionMenu = { inline_keyboard: [] };
            fetchedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
            actionMenu.inline_keyboard.push(
                [{ text: "🔄 Change", callback_data: `assign_next_${panelType}_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                activeTimeouts[chatId] = setTimeout(() => {
                    fetchedNums.forEach(n => { 
                        if (pendingRequests[n] && pendingRequests[n].status !== "success") { 
                            ConsoleLog.findOneAndUpdate({ number: n, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
                            delete pendingRequests[n]; 
                            delete inUseNumbers[n]; 
                        } 
                    });
                    syncPending();
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${panelType}_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                    delete activeTimeouts[chatId];
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        else if (panelType === "zenex" && zenexEntry) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const countryName = typeof zenexEntry === "object" ? zenexEntry.country : zenexEntry;
            const methodName  = typeof zenexEntry === "object" ? zenexEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
            ).catch(() => {});
            
            const cookieToUse = db.zenexCookies;
            const credsToUse  = db.zenexCreds;

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await zenex.getNumber(sel, cookieToUse);
                    const n = numData.number ? numData.number.replace("+", "") : "";
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, carrier: methodName, isZenex: true, platform, cookie: cookieToUse, createdAt: Date.now() };
                        ConsoleLog.create({ number: n, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                    }
                } catch (e) {
                    if (i === 0 && credsToUse?.email) {
                        try {
                            const newCookie = await zenex.login(credsToUse.email, credsToUse.password);
                            db.zenexCookies = newCookie;
                            saveDB();
                            const retryData = await zenex.getNumber(sel, newCookie);
                            const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                            if (retryN) { 
                                fetchedNums.push(retryN); 
                                inUseNumbers[retryN] = true; 
                                pendingRequests[retryN] = { chatId, country: countryName, carrier: methodName, isZenex: true, platform, cookie: newCookie, createdAt: Date.now() }; 
                                ConsoleLog.create({ number: retryN, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                                continue; 
                            }
                        } catch (err2) { break; }
                    }
                    break;
                }
            }
            syncPending();

            if (fetchedNums.length === 0)
                return bot.editMessageText(`❌ Out of stock or error fetching the number.`,
                    { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }
                ).catch(() => {});

            const info    = getCountryInfo(countryName);
            let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
            let replyText = `🤖 **${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
            if (methodName) replyText += `\n📝 **Method:** ${methodName}`;
            replyText += `\n\n👇 _Click a number below to copy:_`;

            let actionMenu = { inline_keyboard: [] };
            fetchedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
            actionMenu.inline_keyboard.push(
                [{ text: "🔄 Change", callback_data: `assign_next_${panelType}_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                activeTimeouts[chatId] = setTimeout(() => {
                    fetchedNums.forEach(n => { 
                        if (pendingRequests[n] && pendingRequests[n].status !== "success") { 
                            ConsoleLog.findOneAndUpdate({ number: n, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
                            delete pendingRequests[n]; 
                            delete inUseNumbers[n]; 
                        } 
                    });
                    syncPending();
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${panelType}_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                    delete activeTimeouts[chatId];
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        else if (panelType === "stex" && stexEntry) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const countryName = typeof stexEntry === "object" ? stexEntry.country : stexEntry;
            const methodName  = typeof stexEntry === "object" ? stexEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
            ).catch(() => {});

            const tokenToUse  = db.stexToken;
            const credsToUse  = db.stexCreds;

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await stex.getNumber(sel, tokenToUse);
                    const n = numData.full_number || numData.number.replace("+", "");
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, carrier: methodName, isStex: true, platform, token: tokenToUse, createdAt: Date.now() };
                        ConsoleLog.create({ number: n, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                    }
                } catch (e) {
                    if (i === 0 && credsToUse?.email) {
                        try {
                            const newToken = await stex.login(credsToUse.email, credsToUse.password);
                            db.stexToken = newToken;
                            saveDB();
                            const retryData = await stex.getNumber(sel, newToken);
                            const retryN    = retryData.full_number || retryData.number.replace("+", "");
                            if (retryN) { 
                                fetchedNums.push(retryN); 
                                inUseNumbers[retryN] = true; 
                                pendingRequests[retryN] = { chatId, country: countryName, carrier: methodName, isStex: true, platform, token: newToken, createdAt: Date.now() }; 
                                ConsoleLog.create({ number: retryN, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                                continue; 
                            }
                        } catch (err2) { break; }
                    }
                    break;
                }
            }
            syncPending();

            if (fetchedNums.length === 0)
                return bot.editMessageText(`❌ Out of stock or error fetching the number.`,
                    { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }
                ).catch(() => {});

            const info     = getCountryInfo(countryName);
            let platName   = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
            let replyText  = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
            if (methodName) replyText += `\n📝 **Method:** ${methodName}`;
            replyText += `\n\n👇 _Click a number below to copy:_`;

            let actionMenu = { inline_keyboard: [] };
            fetchedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
            actionMenu.inline_keyboard.push(
                [{ text: "🔄 Change", callback_data: `assign_next_${panelType}_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                activeTimeouts[chatId] = setTimeout(() => {
                    fetchedNums.forEach(n => { 
                        if (pendingRequests[n] && pendingRequests[n].status !== "success") { 
                            ConsoleLog.findOneAndUpdate({ number: n, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
                            delete pendingRequests[n]; 
                            delete inUseNumbers[n]; 
                        } 
                    });
                    syncPending();
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${panelType}_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                    delete activeTimeouts[chatId]; 
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        else if (panelType === "mk" && mkEntry) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const countryName = typeof mkEntry === "object" ? mkEntry.country : mkEntry;
            const methodName  = typeof mkEntry === "object" ? mkEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
            ).catch(() => {});

            const cookieToUse = db.mkCookies;
            const credsToUse  = db.mkCreds;

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await mk.getNumber(sel, cookieToUse);
                    const n = numData.number ? numData.number.replace("+", "") : "";
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, carrier: methodName, isMk: true, platform, cookie: cookieToUse, createdAt: Date.now() };
                        ConsoleLog.create({ number: n, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                    }
                } catch (e) {
                    if (i === 0 && credsToUse?.email) {
                        try {
                            const newCookie = await mk.login(credsToUse.email, credsToUse.password);
                            db.mkCookies = newCookie;
                            saveDB();
                            const retryData = await mk.getNumber(sel, newCookie);
                            const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                            if (retryN) { 
                                fetchedNums.push(retryN); 
                                inUseNumbers[retryN] = true; 
                                pendingRequests[retryN] = { chatId, country: countryName, carrier: methodName, isMk: true, platform, cookie: newCookie, createdAt: Date.now() }; 
                                ConsoleLog.create({ number: retryN, platform, country: countryName, carrier: methodName, status: "pending" }).catch(()=>{});
                                continue; 
                            }
                        } catch (err2) { break; }
                    }
                    break;
                }
            }
            syncPending();

            if (fetchedNums.length === 0)
                return bot.editMessageText(`❌ Out of stock or error fetching the number.`,
                    { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] } }
                ).catch(() => {});

            const info    = getCountryInfo(countryName);
            let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
            let replyText = `🤖 **${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
            if (methodName) replyText += `\n📝 **Method:** ${methodName}`;
            replyText += `\n\n👇 _Click a number below to copy:_`;

            let actionMenu = { inline_keyboard: [] };
            fetchedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
            actionMenu.inline_keyboard.push(
                [{ text: "🔄 Change", callback_data: `assign_next_${panelType}_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                activeTimeouts[chatId] = setTimeout(() => {
                    fetchedNums.forEach(n => { 
                        if (pendingRequests[n] && pendingRequests[n].status !== "success") { 
                            ConsoleLog.findOneAndUpdate({ number: n, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
                            delete pendingRequests[n]; 
                            delete inUseNumbers[n]; 
                        } 
                    });
                    syncPending();
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${panelType}_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                    delete activeTimeouts[chatId]; 
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        else if (panelType === "iva") {
            const nums = db.availableNumbers[platform][sel] || [];
            if (nums.length === 0)
                return bot.answerCallbackQuery(query.id, { text: `⚠️ This country is currently out of stock!`, show_alert: true });

            const limit       = db.settings.maxNumbers || 4;
            const assignedNums = nums.splice(0, limit);
            db.lastAssigned[chatId] = { country: sel, nums: [...assignedNums] };
            saveDB();

            assignedNums.forEach(n => { 
                inUseNumbers[n] = true; 
                pendingRequests[n] = { chatId, country: sel, platform, carrier: "IVA", createdAt: Date.now() }; 
                ConsoleLog.create({ number: n, platform, country: sel, carrier: "IVA", status: "pending" }).catch(()=>{});
            });
            syncPending();

            const info    = getCountryInfo(sel);
            let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
            let replyText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}\n\n👇 _Click a number below to copy:_`;

            let actionMenu = { inline_keyboard: [] };
            assignedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
            actionMenu.inline_keyboard.push(
                [{ text: "🔄 Change", callback_data: `assign_next_${panelType}_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                activeTimeouts[chatId] = setTimeout(() => {
                    assignedNums.forEach(n => { 
                        if (pendingRequests[n] && pendingRequests[n].status !== "success") { 
                            ConsoleLog.findOneAndUpdate({ number: n, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
                            delete pendingRequests[n]; 
                            delete inUseNumbers[n]; 
                        } 
                    });
                    syncPending();
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    assignedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${panelType}_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                    delete activeTimeouts[chatId]; 
                }, 15 * 60 * 1000);
            }).catch(() => {});
            bot.answerCallbackQuery(query.id);
        }
    }
});

function processFoundOTP(number, time, message, range) {
    // 1. Extract OTP code first
    let otpMatch = message.match(/\b\d{5,8}\b/);
    let otpCode  = otpMatch ? otpMatch[0] : null;

    // 2. OTP-based deduplication
    // Fallback to the full message if no explicit OTP code is found to prevent spamming
    const otpKey = otpCode ? `${number}_${otpCode}` : `${number}_${message.trim()}`;
    
    if (lastProcessedOTPTime[otpKey]) return;
    lastProcessedOTPTime[otpKey] = Date.now();

    let reqData  = pendingRequests[number];

    // 3. Additional safety: Don't process if the exact OTP is already assigned to this request
    if (reqData && reqData.otp && reqData.otp === otpCode) return;

    const cName   = typeof range === "object" ? range.country : range;
    const info    = getCountryInfo(cName || "UNKNOWN");
    const numStr  = String(number);
    const maskedGroupNumber = (numStr.length < 7) ? numStr : `${numStr.slice(0, 4)}XXXX${numStr.slice(-3)}`;

    let platCode = reqData ? reqData.platform : "unknown";
    let platName = platCode === "fb" ? "FACEBOOK" : platCode === "ig" ? "INSTAGRAM" : platCode === "wa" ? "WHATSAPP" : platCode.toUpperCase();

    let groupReplyText = `☁️ eSIM OTP ☁️\n✉️ New OTP Received 🔥\n\n🌍 Country: ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 Platform: ${platName}\n📞 Number: ${maskedGroupNumber}\n✉️ Full SMS:\n> ${message}`;
    let groupMarkup    = { inline_keyboard: [] };
    let groupButtonRow = [];
    if (botInfo?.username) groupButtonRow.push({ text: "📞 Get Number", url: `https://t.me/${botInfo.username}` });
    if (otpCode)           groupButtonRow.push({ text: `COPY OTP`, copy_text: { text: otpCode } });
    if (groupButtonRow.length > 0) groupMarkup.inline_keyboard.push(groupButtonRow);
    bot.sendMessage(GROUP_CHAT_ID, groupReplyText,
        { parse_mode: "Markdown", reply_markup: groupMarkup.inline_keyboard.length > 0 ? groupMarkup : undefined }
    ).catch(() => {});

    if (reqData) {
        reqData.otp = otpCode;
        reqData.message = message;
        reqData.status = "success";
        reqData.receivedAt = Date.now();
        syncPending();

        if (reqData.chatId) {
            const reqInfo    = getCountryInfo(cName);
            let userReplyText = `☁️ eSIM OTP ☁️\n✉️ New OTP Received 🔥\n\n🌍 Country: ${reqInfo.flag} ${reqInfo.cleanName.toUpperCase()}\n🌐 Platform: ${platName}\n📞 Number: \`${number}\`\n✉️ Full SMS:\n> ${message}`;
            let userMarkup   = { inline_keyboard: [] };
            if (otpCode) userMarkup.inline_keyboard.push([{ text: `COPY OTP`, copy_text: { text: otpCode } }]);
            bot.sendMessage(reqData.chatId, userReplyText,
                { parse_mode: "Markdown", reply_markup: userMarkup.inline_keyboard.length > 0 ? userMarkup : undefined }
            ).catch(() => {});
            addBalance(reqData.chatId, 0.50);
        }
    }

    ConsoleLog.findOneAndUpdate(
        { number: String(number), status: "pending" },
        { $set: { status: "success", otp: otpCode, fullMessage: message, receivedAt: Date.now() } }
    ).then(doc => {
        if (!doc) {
            ConsoleLog.create({
                number: String(number),
                platform: platName,
                country: info.cleanName.toUpperCase(),
                carrier: reqData ? reqData.carrier : "System",
                fullMessage: message,
                otp: otpCode,
                status: "success",
                receivedAt: Date.now()
            }).catch(()=>{});
        }
    }).catch(()=>{});
}

app.post("/api/ivas-data", (req, res) => {
    const { type, payload } = req.body;
    if (type === "RANGES") {
        latestRangesFromExtension = payload;
        return res.status(200).json({ success: true });
    }
    if (type === "SMS_LOG") {
        if (Array.isArray(payload))
            payload.forEach(sms => processFoundOTP(sms.number, sms.time, sms.message, sms.range));
        return res.status(200).json({ success: true });
    }
    res.status(400).json({ success: false });
});

app.get("/",     (req, res) => res.status(200).send("Bot is successfully running on Webhook Mode!"));
app.get("/ping", (req, res) => res.status(200).send("Pong! Bot is alive."));

async function autoLoginPanels() {
    if (!isDbLoaded) return;

    if (db.stexCreds && db.stexCreds.email) {
        try {
            const token = await stex.login(db.stexCreds.email, db.stexCreds.password);
            if (token) { db.stexToken = token; saveDB(); }
        } catch (e) {}
    }

    if (db.mkCreds && db.mkCreds.email) {
        try {
            const cookieStr = await mk.login(db.mkCreds.email, db.mkCreds.password);
            if (cookieStr) { db.mkCookies = cookieStr; saveDB(); }
        } catch (e) {}
    }

    if (db.zenexCreds && db.zenexCreds.email) {
        try {
            const cookieStr = await zenex.login(db.zenexCreds.email, db.zenexCreds.password);
            if (cookieStr) { db.zenexCookies = cookieStr; saveDB(); }
        } catch (e) {}
    }
    
    if (db.nxaCreds && db.nxaCreds.email) {
        try {
            const authData = await nxa.login(db.nxaCreds.email, db.nxaCreds.password);
            if (authData && authData.token) { db.nxaToken = authData.token; db.nxaCookies = authData.cookie; saveDB(); }
        } catch (e) {}
    }
}

mongoose.connect(MONGODB_URI).then(async () => {
    const data = await BotDB.findOne();
    if (data) {
        db = { ...db, ...data.toObject() };

        if (!db.availableNumbers.fb && !db.availableNumbers.ig && !db.availableNumbers.wa) {
            const oldData = { ...db.availableNumbers };
            db.availableNumbers = { fb: oldData, ig: {}, wa: {} };
        }
        if (!db.stexRanges) db.stexRanges = { fb: {}, ig: {}, wa: {} };
        if (!db.stexRanges.fb && !db.stexRanges.ig && !db.stexRanges.wa) {
            const oldStex = { ...db.stexRanges };
            db.stexRanges = { fb: oldStex, ig: {}, wa: {} };
        }
        if (!db.mkRanges)            db.mkRanges           = { fb: {}, ig: {}, wa: {} };
        if (!db.zenexRanges)         db.zenexRanges        = { fb: {}, ig: {}, wa: {} }; 
        if (!db.nxaRanges)           db.nxaRanges          = { fb: {}, ig: {}, wa: {} }; 
        
        if (!db.savedStexAccounts)   db.savedStexAccounts  = [];
        if (!db.savedMkAccounts)     db.savedMkAccounts    = [];
        if (!db.savedZenexAccounts)  db.savedZenexAccounts = []; 
        if (!db.savedNxaAccounts)    db.savedNxaAccounts   = []; 
        
        if (db.settings.userPanelAccess !== undefined) delete db.settings.userPanelAccess;
        if (!db.settings.lastBroadcast) db.settings.lastBroadcast = []; 

        if (db.stexCreds?.email && db.savedStexAccounts.length === 0) db.savedStexAccounts.push(db.stexCreds);
        if (db.mkCreds?.email   && db.savedMkAccounts.length   === 0) db.savedMkAccounts.push(db.mkCreds);
        if (db.zenexCreds?.email&& db.savedZenexAccounts.length=== 0) db.savedZenexAccounts.push(db.zenexCreds);
        if (db.nxaCreds?.email  && db.savedNxaAccounts.length  === 0) db.savedNxaAccounts.push(db.nxaCreds);

        if (!db.pendingRequests) db.pendingRequests = {};
        pendingRequests = db.pendingRequests;
        for (let num in pendingRequests) {
            if (pendingRequests[num].status !== "success" || (Date.now() - pendingRequests[num].receivedAt < 12 * 60 * 60 * 1000)) {
                inUseNumbers[num] = true;
            } else {
                delete pendingRequests[num];
            }
        }

    } else {
        await BotDB.create(db);
    }

    isDbLoaded = true;
    app.listen(PORT, () => console.log(`🚀 Webhook Mode running on port ${PORT}`));

    setTimeout(autoLoginPanels, 10000);

}).catch(err => console.log(err));

setInterval(autoLoginPanels, 20 * 60 * 1000);

setInterval(async () => {
    const reqs = Object.values(pendingRequests).filter(r => r.isStex && r.status !== "success");
    if (reqs.length === 0) return;

    const tokensToPoll = [...new Set(reqs.map(r => r.token).filter(Boolean))];
    for (const token of tokensToPoll) {
        try {
            const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
            d.setHours(d.getHours() - 4);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

            const records = await stex.checkInfo(dateStr, token);
            if (Array.isArray(records)) {
                records.forEach(rec => {
                    let num = rec.number ? String(rec.number).replace("+", "") : null;
                    if (num && pendingRequests[num] && pendingRequests[num].token === token) {
                        let status = String(rec.status || "").toLowerCase();
                        let msg    = rec.sms || rec.message || rec.otp || rec.text;
                        if ((status === "success" || status === "completed" || msg) && msg) {
                            msg = String(msg);
                            if (!msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                processFoundOTP(num, Date.now(), msg, pendingRequests[num].country);
                            }
                        }
                    }
                });
            }
        } catch (e) {}
    }
}, 1500);

setInterval(async () => {
    const reqs = Object.values(pendingRequests).filter(r => r.isMk && r.status !== "success");
    if (reqs.length === 0) return;

    const cookiesToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];
    for (const cookie of cookiesToPoll) {
        try {
            const d       = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const records = await mk.checkInfo(dateStr, cookie);

            if (Array.isArray(records)) {
                records.forEach(rec => {
                    let rawNum      = String(rec.phone_number || rec.number || "");
                    let cleanRecNum = rawNum.replace(/\D/g, "");
                    if (cleanRecNum) {
                        let pendingKey = Object.keys(pendingRequests).find(
                            k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isMk && pendingRequests[k].cookie === cookie
                        );
                        if (pendingKey) {
                            let msg = rec.full_sms_list || rec.sms || rec.otps || rec.message || rec.text;
                            if (msg && typeof msg === "string" && !msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                processFoundOTP(pendingKey, Date.now(), msg, pendingRequests[pendingKey].country);
                            }
                        }
                    }
                });
            }
        } catch (e) {}
    }
}, 1500);

setInterval(async () => {
    const reqs = Object.values(pendingRequests).filter(r => r.isZenex && r.status !== "success");
    if (reqs.length === 0) return;

    const cookiesToPoll = [...new Set(reqs.map(r => r.cookie).filter(Boolean))];
    for (const cookie of cookiesToPoll) {
        try {
            const records = await zenex.checkInfo(cookie);

            if (Array.isArray(records)) {
                records.forEach(rec => {
                    let rawNum      = String(rec.number || "");
                    let cleanRecNum = rawNum.replace(/\D/g, "");
                    if (cleanRecNum) {
                        let pendingKey = Object.keys(pendingRequests).find(
                            k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isZenex && pendingRequests[k].cookie === cookie
                        );
                        if (pendingKey) {
                            let msg = rec.sms;
                            if (msg && typeof msg === "string" && !msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                processFoundOTP(pendingKey, Date.now(), msg, pendingRequests[pendingKey].country);
                            }
                        }
                    }
                });
            }
        } catch (e) {}
    }
}, 1500);

setInterval(async () => {
    const reqs = Object.values(pendingRequests).filter(r => r.isNxa && r.status !== "success");
    if (reqs.length === 0) return;

    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
    d.setHours(d.getHours() - 6); 
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const authKeys = [...new Set(reqs.map(r => `${r.token}|${r.cookie}`))];
    for (const authStr of authKeys) {
        const [token, cookie] = authStr.split("|");
        try {
            const response = await nxa.checkInfo(token, cookie, dateStr);
            
            const records = Array.isArray(response) ? response : (response?.data || []);

            if (Array.isArray(records)) {
                records.forEach(rec => {
                    if (rec.allocated_at && !rec.allocated_at.startsWith(dateStr)) return;

                    let pendingKey = Object.keys(pendingRequests).find(k => 
                        pendingRequests[k].isNxa && 
                        pendingRequests[k].token === token &&
                        pendingRequests[k].internal_id === rec.internal_id
                    );

                    if (!pendingKey) {
                        let rawNum = String(rec.number || "");
                        let cleanRecNum = rawNum.replace(/\D/g, "");
                        if (cleanRecNum) {
                            pendingKey = Object.keys(pendingRequests).find(k => 
                                k.replace(/\D/g, "") === cleanRecNum && 
                                pendingRequests[k].isNxa && 
                                pendingRequests[k].token === token
                            );
                        }
                    }

                    if (pendingKey) {
                        let status = String(rec.status || "").toLowerCase();
                        let msg = rec.message || rec.otp;

                        if (status === "success" && msg && typeof msg === "string") {
                            if (!msg.toLowerCase().includes("waiting") && !msg.toLowerCase().includes("pending")) {
                                processFoundOTP(pendingKey, Date.now(), msg, pendingRequests[pendingKey].country);
                            }
                        }
                    }
                });
            }
        } catch (e) {}
    }
}, 1500);

setInterval(async () => {
    if (!db.zenexCookies && !db.zenexCreds) return;
    try {
        const apiKey = db.zenexCookies || db.zenexCreds?.password;
        const ranges = await zenex.getLiveTraffic(apiKey);
        console.log("RANGES:", ranges.length);
console.log("LIVE LOGS:", liveLogs.length);
        const liveLogs = await zenex.getLiveConsole(apiKey);
        if (!Array.isArray(liveLogs) || liveLogs.length === 0) {
    return;
}
        console.log("LIVE LOGS:", liveLogs.length);
        const liveLog = liveLogs && liveLogs.length
    ? liveLogs[Math.floor(Math.random() * Math.min(liveLogs.length, 10))]
    : null;
        if (!ranges || ranges.length === 0) {
    console.log("NO RANGES FOUND");
    return;
}
        if (ranges && ranges.length > 0) {
            const randomRoute = ranges[Math.floor(Math.random() * Math.min(ranges.length, 10))];
            
            // Get Country Info
            let cleanRange = String(randomRoute.range || "").replace(/X/g, "0");
            let info = getCountryInfo(detectCountryFromRange(cleanRange));

            // Generate and Mask Number
            let fakeNum = randomRoute.range.replace(/X/gi, () => Math.floor(Math.random() * 10));
            let numStr = String(fakeNum);
            let maskedGroupNumber = (numStr.length < 7) ? numStr : `${numStr.slice(0, 4)}XXXX${numStr.slice(-3)}`;

            let platName = randomRoute.service ? randomRoute.service.toUpperCase() : "UNKNOWN";
           let msgText = liveLog?.otp || "New verification message received";

const otpMatch = msgText.match(/\b\d{4,8}\b/);
let fakeOtp = otpMatch ? otpMatch[0] : "000000";
            // Format SMS
            let groupReplyText = `☁️ eSIM OTP ☁️\n✉️ New OTP Received 🔥\n\n🌍 Country: ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 Platform: ${platName}\n📞 Number: ${maskedGroupNumber}\n✉️ Full SMS:\n> ${msgText}`;
            
            // Add Buttons
            let groupMarkup = { inline_keyboard: [] };
            let groupButtonRow = [];
            if (botInfo?.username) groupButtonRow.push({ text: "📞 Get Number", url: `https://t.me/${botInfo.username}` });
            groupButtonRow.push({ text: `COPY OTP`, copy_text: { text: String(fakeOtp) } });
            
            if (groupButtonRow.length > 0) groupMarkup.inline_keyboard.push(groupButtonRow);

            bot.sendMessage(GROUP_CHAT_ID, groupReplyText, { 
                reply_markup: groupMarkup 
            }).catch(() => {});

           ConsoleLog.create({
    number: numStr,
   platform: liveLog?.service || platName,
country: (liveLog?.country || info.cleanName).toUpperCase(),
    range: randomRoute?.range || "",
    carrier: "Zenex",
                fullMessage: msgText,
                otp: String(fakeOtp),
                status: "success",
                receivedAt: Date.now()
            }).catch(()=>{});
        }
    } catch (e) {}
}, 12000);

setInterval(() => {
    let changed = false;
    const now = Date.now();
    for (const num in pendingRequests) {
        const req = pendingRequests[num];
        if (req.status === "success" && req.receivedAt && (now - req.receivedAt > 12 * 60 * 60 * 1000)) {
            delete pendingRequests[num];
            delete inUseNumbers[num];
            changed = true;
        } else if (req.status !== "success" && req.createdAt && (now - req.createdAt > 20 * 60 * 1000)) {
            ConsoleLog.findOneAndUpdate({ number: num, status: "pending" }, { $set: { status: "failed" } }).catch(()=>{});
            delete pendingRequests[num];
            delete inUseNumbers[num];
            changed = true;
        }
    }
    if (changed) {
        syncPending();
    }
}, 60 * 1000);

// Clean up old OTP records to prevent memory bloat
setInterval(() => {
    const now = Date.now();
    for (const key in lastProcessedOTPTime) {
        if (now - lastProcessedOTPTime[key] > 12 * 60 * 60 * 1000) {
            delete lastProcessedOTPTime[key];
        }
    }
}, 60 * 60 * 1000); // Runs every 1 hour
