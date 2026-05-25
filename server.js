// ============================================================
// #  DEPENDENCIES & IMPORTS
// ============================================================

const express        = require("express");
const TelegramBot    = require("node-telegram-bot-api");
const mongoose       = require("mongoose");
const { authenticator } = require("otplib");
const stex           = require("./stex.js");
const mk             = require("./mk.js");


// ============================================================
// #  CONFIGURATION
// ============================================================

const botToken        = process.env.BOT_TOKEN        || "8529122267:AAEjUc_8-EcNeHnwP1YPT6FX8wB51k35qKg";
const ADMIN_ID        = Number(process.env.ADMIN_ID) || 8278612952;
const GROUP_CHAT_ID   = Number(process.env.GROUP_CHAT_ID) || -1003852968469;
const GROUP_INVITE_LINK = process.env.GROUP_INVITE_LINK || "https://t.me/+x_1_25vVZJswNWM1";
const MONGODB_URI     = process.env.MONGODB_URI      || "mongodb+srv://ahnanhaque_db_user:p9WFrr4y95miiOsX@cluster0.ygxl28d.mongodb.net/?appName=Cluster0";
const PORT            = process.env.PORT             || 3000;


// ============================================================
// #  EXPRESS APP SETUP
// ============================================================

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


// ============================================================
// #  TELEGRAM BOT SETUP
// ============================================================

const bot = new TelegramBot(botToken, {
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
    request: { agentOptions: { keepAlive: true, family: 4 } }
});

bot.on("polling_error", (err) => {
    if (err && err.message && !err.message.includes("message is not modified"))
        console.log("\n[Telegram Polling Error]", err.message);
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


// ============================================================
// #  DATABASE SCHEMA & MODEL
// ============================================================

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
    stexCreds:          Object,
    mkCreds:            Object,
    savedStexAccounts:  Array,
    savedMkAccounts:    Array
}, { strict: false });

const BotDB = mongoose.model("BotData", dbSchema);


// ============================================================
// #  IN-MEMORY STATE VARIABLES
// ============================================================

let db = {
    balances:          {},
    lastAssigned:      {},
    adminUsernames:    [],
    users:             [],
    referred:          {},
    settings:          { maxNumbers: 4 },
    availableNumbers:  { fb: {}, ig: {}, wa: {} },
    cookies:           {},
    stexRanges:        { fb: {}, ig: {}, wa: {} },
    stexToken:         "",
    mkRanges:          { fb: {}, ig: {}, wa: {} },
    mkCookies:         "",
    stexCreds:         null,
    mkCreds:           null,
    savedStexAccounts: [],
    savedMkAccounts:   []
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


// ============================================================
// #  DATABASE HELPER FUNCTIONS
// ============================================================

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


// ============================================================
// #  PERMISSION & AUTH HELPER FUNCTIONS
// ============================================================

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
    try {
        const member = await bot.getChatMember(GROUP_CHAT_ID, userId);
        return ["creator", "administrator", "member", "restricted"].includes(member.status);
    } catch (e) {
        return false;
    }
}

function sendJoinPrompt(chatId) {
    bot.sendMessage(chatId,
        `⚠️ **Access Denied!**\n\nYou must join our official group first to use this bot. Once joined, click the check button below.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📢 Join Group", url: GROUP_INVITE_LINK }],
                    [{ text: "🔄 Check Again", callback_data: "check_join" }]
                ]
            },
            parse_mode: "Markdown"
        }
    ).catch(() => {});
}

function clearPendingForChat(chatId) {
    for (let num in pendingRequests) {
        if (pendingRequests[num].chatId === chatId) {
            delete inUseNumbers[num];
            delete pendingRequests[num];
        }
    }
}


// ============================================================
// #  COUNTRY & PLATFORM DETECTION UTILITIES
// ============================================================

const countryPrefixes = {
    "1": "USA", "7": "RUSSIA", "20": "EGYPT", "27": "SOUTH AFRICA", "30": "GREECE",
    "31": "NETHERLANDS", "32": "BELGIUM", "33": "FRANCE", "34": "SPAIN", "36": "HUNGARY",
    "39": "ITALY", "40": "ROMANIA", "43": "AUSTRIA", "44": "UK", "45": "DENMARK",
    "46": "SWEDEN", "47": "NORWAY", "48": "POLAND", "49": "GERMANY", "51": "PERU",
    "52": "MEXICO", "53": "CUBA", "54": "ARGENTINA", "55": "BRAZIL", "56": "CHILE",
    "57": "COLOMBIA", "58": "VENEZUELA", "60": "MALAYSIA", "61": "AUSTRALIA",
    "62": "INDONESIA", "63": "PHILIPPINES", "64": "NEW ZEALAND", "65": "SINGAPORE",
    "66": "THAILAND", "81": "JAPAN", "82": "SOUTH KOREA", "84": "VIETNAM", "86": "CHINA",
    "90": "TURKEY", "91": "INDIA", "92": "PAKISTAN", "93": "AFGHANISTAN", "94": "SRI LANKA",
    "95": "MYANMAR", "98": "IRAN", "211": "SOUTH SUDAN", "212": "MOROCCO", "213": "ALGERIA",
    "216": "TUNISIA", "218": "LIBYA", "220": "GAMBIA", "221": "SENEGAL", "222": "MAURITANIA",
    "223": "MALI", "224": "GUINEA", "225": "IVORY COAST", "226": "BURKINA FASO",
    "227": "NIGER", "228": "TOGO", "229": "BENIN", "230": "MAURITIUS", "231": "LIBERIA",
    "232": "SIERRA LEONE", "233": "GHANA", "234": "NIGERIA", "235": "CHAD",
    "236": "CENTRAL AFRICA", "237": "CAMEROON", "238": "CAPE VERDE", "239": "SAO TOME",
    "240": "EQUATORIAL GUINEA", "241": "GABON", "242": "CONGO", "243": "DR CONGO",
    "244": "ANGOLA", "245": "GUINEA BISSAU", "246": "DIEGO GARCIA", "248": "SEYCHELLES",
    "249": "SUDAN", "250": "RWANDA", "251": "ETHIOPIA", "252": "SOMALIA", "253": "DJIBOUTI",
    "254": "KENYA", "255": "TANZANIA", "256": "UGANDA", "257": "BURUNDI",
    "258": "MOZAMBIQUE", "260": "ZAMBIA", "261": "MADAGASCAR", "262": "REUNION",
    "263": "ZIMBABWE", "264": "NAMIBIA", "265": "MALAWI", "266": "LESOTHO",
    "267": "BOTSWANA", "268": "ESWATINI", "269": "COMOROS", "351": "PORTUGAL",
    "352": "LUXEMBOURG", "353": "IRELAND", "354": "ICELAND", "355": "ALBANIA",
    "356": "MALTA", "357": "CYPRUS", "358": "FINLAND", "359": "BULGARIA",
    "370": "LITHUANIA", "371": "LATVIA", "372": "ESTONIA", "373": "MOLDOVA",
    "374": "ARMENIA", "375": "BELARUS", "376": "ANDORRA", "377": "MONACO",
    "378": "SAN MARINO", "380": "UKRAINE", "381": "SERBIA", "382": "MONTENEGRO",
    "385": "CROATIA", "386": "SLOVENIA", "387": "BOSNIA", "389": "MACEDONIA",
    "852": "HONG KONG", "853": "MACAU", "855": "CAMBODIA", "856": "LAOS",
    "880": "BANGLADESH", "960": "MALDIVES", "961": "LEBANON", "962": "JORDAN",
    "963": "SYRIA", "964": "IRAQ", "965": "KUWAIT", "966": "SAUDI ARABIA",
    "967": "YEMEN", "968": "OMAN", "971": "UAE", "972": "ISRAEL", "973": "BAHRAIN",
    "974": "QATAR", "975": "BHUTAN", "976": "MONGOLIA", "977": "NEPAL",
    "992": "TAJIKISTAN", "993": "TURKMENISTAN", "994": "AZERBAIJAN", "995": "GEORGIA",
    "996": "KYRGYZSTAN", "998": "UZBEKISTAN"
};

const countryData = {
    "SIERRA LEONE": { flag: "🇸🇱" }, "TUNISIA": { flag: "🇹🇳" }, "ETHIOPIA": { flag: "🇪🇹" },
    "CENTRAL AFRICA": { flag: "🇨🇫" }, "MONGOLIA": { flag: "🇲🇳" }, "MYANMAR": { flag: "🇲🇲" },
    "CAMEROON": { flag: "🇨🇲" }, "MALI": { flag: "🇲🇱" }, "TOGO": { flag: "🇹🇬" },
    "IVORY COAST": { flag: "🇨🇮" }, "SENEGAL": { flag: "🇸🇳" }, "NIGERIA": { flag: "🇳🇬" },
    "GHANA": { flag: "🇬🇭" }, "KENYA": { flag: "🇰🇪" }, "SOUTH AFRICA": { flag: "🇿🇦" },
    "MOROCCO": { flag: "🇲🇦" }, "BRAZIL": { flag: "🇧🇷" }, "MEXICO": { flag: "🇲🇽" },
    "INDIA": { flag: "🇮🇳" }, "BANGLADESH": { flag: "🇧🇩" }, "PAKISTAN": { flag: "🇵🇰" },
    "PHILIPPINES": { flag: "🇵🇭" }, "INDONESIA": { flag: "🇮🇩" }, "VIETNAM": { flag: "🇻🇳" },
    "THAILAND": { flag: "🇹🇭" }, "USA": { flag: "🇺🇸" }, "UK": { flag: "🇬🇧" },
    "FRANCE": { flag: "🇫🇷" }, "GERMANY": { flag: "🇩🇪" }, "ITALY": { flag: "🇮🇹" },
    "SPAIN": { flag: "🇪🇸" }, "COLOMBIA": { flag: "🇨🇴" }, "ARGENTINA": { flag: "🇦🇷" },
    "TURKEY": { flag: "🇹🇷" }, "RUSSIA": { flag: "🇷🇺" }, "UKRAINE": { flag: "🇺🇦" },
    "MACAU": { flag: "🇲🇴" }, "HONG KONG": { flag: "🇭🇰" }, "MALAYSIA": { flag: "🇲🇾" },
    "CAMBODIA": { flag: "🇰🇭" }, "LAOS": { flag: "🇱🇦" }, "SRI LANKA": { flag: "🇱🇰" },
    "NEPAL": { flag: "🇳🇵" }, "ALGERIA": { flag: "🇩🇿" }, "MADAGASCAR": { flag: "🇲🇬" },
    "ROMANIA": { flag: "🇷🇴" }, "POLAND": { flag: "🇵🇱" }, "PORTUGAL": { flag: "🇵🇹" },
    "NETHERLANDS": { flag: "🇳🇱" }, "SWEDEN": { flag: "🇸🇪" }, "UZBEKISTAN": { flag: "🇺🇿" },
    "KYRGYZSTAN": { flag: "🇰🇬" }, "SOUTH KOREA": { flag: "🇰🇷" }, "JAPAN": { flag: "🇯🇵" },
    "MACEDONIA": { flag: "🇲🇰" }, "ZAMBIA": { flag: "🇿🇲" }, "ZIMBABWE": { flag: "🇿🇼" },
    "CHILE": { flag: "🇨🇱" }, "VENEZUELA": { flag: "🇻🇪" }, "ANGOLA": { flag: "🇦🇴" },
    "UGANDA": { flag: "🇺🇬" }, "TANZANIA": { flag: "🇹🇿" }, "RWANDA": { flag: "🇷🇼" },
    "SAUDI ARABIA": { flag: "🇸🇦" }, "UAE": { flag: "🇦🇪" }, "IRAQ": { flag: "🇮🇶" },
    "IRAN": { flag: "🇮🇷" }, "SINGAPORE": { flag: "🇸🇬" }, "AUSTRALIA": { flag: "🇦🇺" },
    "CONGO": { flag: "🇨🇩" }, "MOLDOVA": { flag: "🇲🇩" }, "SERBIA": { flag: "🇷🇸" },
    "CROATIA": { flag: "🇭🇷" }, "BULGARIA": { flag: "🇧🇬" }, "LITHUANIA": { flag: "🇱🇹" },
    "LATVIA": { flag: "🇱🇻" }, "ESTONIA": { flag: "🇪🇪" }, "FINLAND": { flag: "🇫🇮" },
    "NORWAY": { flag: "🇳🇴" }, "DENMARK": { flag: "🇩🇰" }, "TAJIKISTAN": { flag: "🇹🇯" },
    "BELARUS": { flag: "🇧🇾" }, "GEORGIA": { flag: "🇬🇪" }, "ARMENIA": { flag: "🇬🇪" },
    "AFGHANISTAN": { flag: "🇦🇫" }, "SYRIA": { flag: "🇸🇾" }, "YEMEN": { flag: "🇾🇪" },
    "OMAN": { flag: "🇴🇲" }
};

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

function detectCountryFromRange(range) {
    let cleanRange = String(range || "").replace(/\D/g, "");
    for (let i = 4; i >= 1; i--) {
        let prefix = cleanRange.substring(0, i);
        if (countryPrefixes[prefix]) return countryPrefixes[prefix];
    }
    return "UNKNOWN";
}

function getCountryInfo(data) {
    if (!data) return { flag: "🌍", cleanName: "Unknown" };
    let countryName = typeof data === "object" ? (data.country || "Unknown") : data;
    let strName = String(countryName);
    let flag = "🌍";
    let cleanName = strName.replace(/\s*[vV]?\d+.*$/, "").trim();

    for (const key in countryData) {
        if (strName.toUpperCase().includes(key)) {
            flag = countryData[key].flag;
            cleanName = key.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            break;
        }
    }

    if (flag === "🌍") {
        cleanName = cleanName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    return { flag, cleanName };
}


// ============================================================
// #  MENU & KEYBOARD BUILDER FUNCTIONS
// ============================================================

function getReplyMenu(chatId, username) {
    let keyboard = [
        [{ text: "☎️ Get Number" }, { text: "📧 Temp Mail" }],
        [{ text: "🔑 2FA" },        { text: "👤 Profile" }]
    ];
    if (isAdmin(chatId, username)) {
        keyboard.push([{ text: "💬 Support" }, { text: "⚙️ Admin Panel" }]);
    } else {
        keyboard.push([{ text: "💬 Support" }]);
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
        [{ text: "Add Number ➕", callback_data: "admin_add_number_manual" }],
        [{ text: "⬅️ Back",       callback_data: "admin_manage_numbers" }]
    ]
};

function getAdminMenu(chatId) {
    let menu = [
        [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" },
         { text: "🔢 Set Number Limit",  callback_data: "admin_set_limit" }],
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


// ============================================================
// #  BOT COMMANDS  (/start  /admin)
// ============================================================

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
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
    if (!isAdmin(msg.chat.id, msg.from.username))
        return bot.sendMessage(msg.chat.id, "❌ Access Denied. You do not have the required admin rights.").catch(() => {});
    bot.sendMessage(msg.chat.id, "⚙️ **Admin Panel:**",
        { reply_markup: getAdminMenu(msg.chat.id), parse_mode: "Markdown" }
    ).catch(() => {});
});


// ============================================================
// #  MESSAGE HANDLER
// ============================================================

bot.on("message", async (msg) => {
    const chatId   = msg.chat.id;
    const username = msg.from.username;
    const text     = msg.text || msg.caption || "";

    if (!db.users.includes(chatId)) { db.users.push(chatId); saveDB(); }

    // ── Broadcast (Admin Only) ───────────────────────────────
    if (userStates[chatId] === "WAITING_FOR_BROADCAST" && isAdmin(chatId, username)) {
        if (text === "✖ Close Menu" || text.startsWith("/")) {
            delete userStates[chatId];
            return;
        }
        bot.sendMessage(chatId, `⏳ Broadcasting your message to all users. Please wait...`).catch(() => {});
        let successCount = 0;
        for (let uId of db.users) {
            try {
                await bot.copyMessage(uId, chatId, msg.message_id, { reply_markup: { remove_keyboard: true } });
                successCount++;
            } catch (e) {}
        }
        bot.sendMessage(chatId, `✅ **Broadcast Complete!** Successfully sent to ${successCount} users.`).catch(() => {});
        delete userStates[chatId];
        return;
    }

    if (!text || text.startsWith("/")) return;

    // ── Group membership check ───────────────────────────────
    const restrictedWords = ["☎️ Get Number", "🔑 2FA", "👤 Profile", "💬 Support", "⚙️ Admin Panel"];
    if ((restrictedWords.includes(text) || userStates[chatId]) && text !== "📧 Temp Mail" && !await isUserMember(msg.from.id)) {
        return sendJoinPrompt(chatId);
    }

    if (restrictedWords.includes(text) || text === "📧 Temp Mail") delete userStates[chatId];

    // ── Get Number ───────────────────────────────────────────
    if (text === "☎️ Get Number") {
        clearPendingForChat(chatId);
        bot.sendMessage(chatId,
            `🛠 Please select the platform you want to receive an OTP for:`,
            { reply_markup: platformMenu }
        ).catch(() => {});
    }

    // ── Temp Mail ────────────────────────────────────────────
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

    // ── Profile ──────────────────────────────────────────────
    else if (text === "👤 Profile") {
        bot.sendMessage(chatId,
            `👤 **Profile Info:**\n🆔 **User ID:** \`${chatId}\`\n📛 **Name:** ${msg.from.first_name || "N/A"}\n🎭 **Role:** ${isAdmin(chatId, username) ? (isSuperAdmin(chatId) ? "Super Admin 👑" : "Admin 🛡️") : "User 👤"}\n💰 **Balance:** ${getBalance(chatId).toFixed(2)} BDT\n\n🔗 **Referral Link:**\n\`https://t.me/${botInfo.username}?start=${chatId}\`\n_(Invite friends and earn 10 BDT for each new user!)_`,
            { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw", callback_data: "withdraw_funds" }]] } }
        ).catch(() => {});
    }

    // ── 2FA Authenticator ────────────────────────────────────
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

    // ── Support ──────────────────────────────────────────────
    else if (text === "💬 Support") {
        bot.sendMessage(chatId,
            "💬 <b>Support:</b>\nPlease contact our admin @ahnan_haque_mahi for any assistance.",
            { parse_mode: "HTML" }
        ).catch(() => {});
    }

    // ── Admin Panel (text button) ────────────────────────────
    else if (text === "⚙️ Admin Panel" && isAdmin(chatId, username)) {
        bot.sendMessage(chatId, "⚙️ **Admin Panel:**",
            { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }
        ).catch(() => {});
    }

    // ── Admin: Set Number Limit ──────────────────────────────
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

    // ── Admin: Add Manual Country ────────────────────────────
    else if (userStates[chatId] === "WAITING_FOR_MANUAL_COUNTRY" && isAdmin(chatId, username)) {
        const info = getCountryInfo(text.trim().toUpperCase());
        tempAdminData[chatId] = { ...tempAdminData[chatId], addNumberCountry: text.trim().toUpperCase() };
        userStates[chatId]    = "WAITING_FOR_ADD_NUMBERS";
        bot.sendMessage(chatId,
            `✅ **Country Selected:** ${info.flag} ${info.cleanName}\n\nPlease paste the numbers below (each on a new line):`,
            { parse_mode: "Markdown" }
        ).catch(() => {});
    }

    // ── Admin: Add Numbers to Country ───────────────────────
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

    // ── User: Withdraw (bKash/Nagad) ─────────────────────────
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

    // ── SuperAdmin: Add New Admin ────────────────────────────
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

    // ── Admin: Stex SMS Credentials ──────────────────────────
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

    // ── Admin: Stex Range Input ──────────────────────────────
    else if (userStates[chatId] === "WAITING_FOR_STEX_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "stex" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId,
                `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**\n(Example: Server 1, Fast API, etc.)`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
        }
    }

    // ── Admin: MK SMS Credentials ────────────────────────────
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

    // ── Admin: MK Range Input ────────────────────────────────
    else if (userStates[chatId] === "WAITING_FOR_MK_RANGE" && isAdmin(chatId, username)) {
        const range = text.trim();
        if (range.length >= 5) {
            const country = detectCountryFromRange(range);
            tempAdminData[chatId] = { ...tempAdminData[chatId], pendingRange: range, pendingCountry: country, pendingPanel: "mk" };
            userStates[chatId]    = "WAITING_FOR_METHOD_NAME";
            bot.sendMessage(chatId,
                `✅ Range **${range}** detected as **${country}**.\n\n📝 **Now enter the Method Name:**\n(Example: Server 1, Fast API, etc.)`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        } else {
            bot.sendMessage(chatId, "❌ Invalid format. Please provide a valid range.").catch(() => {});
        }
    }

    // ── Admin: Method Name for Range ─────────────────────────
    else if (userStates[chatId] === "WAITING_FOR_METHOD_NAME" && isAdmin(chatId, username)) {
        const method   = text.trim();
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        const range    = tempAdminData[chatId]?.pendingRange;
        const country  = tempAdminData[chatId]?.pendingCountry;
        const panel    = tempAdminData[chatId]?.pendingPanel;

        if (panel === "stex") {
            if (!db.stexRanges[platform]) db.stexRanges[platform] = {};
            db.stexRanges[platform][range] = { country, method };
            saveDB();
            bot.sendMessage(chatId,
                `✅ Successfully added Stex Range **${range}** for **${platform.toUpperCase()}**.\n🌍 Country: **${country}**\n📝 Method: **${method}**`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        } else if (panel === "mk") {
            if (!db.mkRanges[platform]) db.mkRanges[platform] = {};
            db.mkRanges[platform][range] = { country, method };
            saveDB();
            bot.sendMessage(chatId,
                `✅ Successfully added MK Range **${range}** for **${platform.toUpperCase()}**.\n🌍 Country: **${country}**\n📝 Method: **${method}**`,
                { parse_mode: "Markdown" }
            ).catch(() => {});
        }

        delete userStates[chatId];
        if (tempAdminData[chatId]) {
            delete tempAdminData[chatId].pendingRange;
            delete tempAdminData[chatId].pendingCountry;
            delete tempAdminData[chatId].pendingPanel;
        }
    }
});


// ============================================================
// #  CALLBACK QUERY HANDLER
// ============================================================

bot.on("callback_query", async (query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const data      = query.data;
    const username  = query.from.username;

    // ── Join Check ───────────────────────────────────────────
    if (data === "check_join") {
        if (await isUserMember(query.from.id)) {
            bot.deleteMessage(chatId, messageId).catch(() => {});
            bot.sendMessage(chatId, `Welcome! 👋`, { reply_markup: getReplyMenu(chatId, username) }).catch(() => {});
            return bot.answerCallbackQuery(query.id, { text: "✅ Thank you for joining! You can now use the bot." });
        }
        return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined the group yet. Please join first!", show_alert: true });
    }

    if (!await isUserMember(query.from.id))
        return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined the group yet.", show_alert: true });

    // ── Admin-only action guard ──────────────────────────────
    const adminActs = ["admin_", "togglerng_", "refresh_", "deladmin_", "addnum_",
                       "placeholder_stex", "stex_", "stexdel_", "placeholder_mk", "mk_",
                       "placeholder_iva", "delnumrng_", "delstexrng_", "delmkrng_", "delall_"];
    if (adminActs.some(a => data.startsWith(a)) && !isAdmin(chatId, username) && data !== "refresh_2fa")
        return bot.answerCallbackQuery(query.id, { text: "❌ Permission Denied! You do not have admin access for this action.", show_alert: true });

    // ── Close Menu ───────────────────────────────────────────
    if (data === "close_menu") {
        bot.deleteMessage(chatId, messageId).catch(() => {});
        return bot.answerCallbackQuery(query.id);
    }

    // ── 2FA Refresh ──────────────────────────────────────────
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

    // ── Admin Panel ──────────────────────────────────────────
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

    else if (data === "admin_set_limit") {
        userStates[chatId] = "WAITING_FOR_LIMIT";
        bot.sendMessage(chatId, `🔢 **Please enter the new number limit:**`).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    // ── Manage Panel (IVA / Stex / MK Login) ────────────────
    else if (data === "admin_manage_panel") {
        bot.editMessageText("⚙️ **Login to panel :**", {
            chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [
                [{ text: "IVA SMS 📩",  callback_data: "placeholder_iva" }],
                [{ text: "Stex SMS 📨", callback_data: "stex_login" }],
                [{ text: "MK SMS ✉️",  callback_data: "placeholder_mk_login" }],
                [{ text: "⬅️ Back",     callback_data: "admin_panel" }]
            ]}
        }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    // ── Stex: Account Management ─────────────────────────────
    else if (data === "stex_login") {
        let btns = [];
        if (db.savedStexAccounts && db.savedStexAccounts.length > 0) {
            db.savedStexAccounts.forEach((acc, idx) => {
                let activeMark = (db.stexCreds && db.stexCreds.email === acc.email) ? "✅ " : "👤 ";
                btns.push([{ text: `${activeMark}${acc.email}`, callback_data: `stex_qlogin_${idx}` }]);
            });
            btns.push([{ text: "Remove Account", callback_data: "stex_remove_menu" }]);
        }
        btns.push([{ text: "Add Account", callback_data: "stex_manual_login" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_panel" }]);
        bot.editMessageText("🔑 **Stex SMS Login:**\nChoose an account to login or add a new one:",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "stex_remove_menu") {
        let btns = [];
        (db.savedStexAccounts || []).forEach((acc, idx) => {
            btns.push([{ text: `❌ ${acc.email}`, callback_data: `stex_delacc_${idx}` }]);
        });
        btns.push([{ text: "⬅️ Back", callback_data: "stex_login" }]);
        bot.editMessageText("🗑️ **Select an account to remove:**",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("stex_delacc_")) {
        const idx = parseInt(data.replace("stex_delacc_", ""));
        const acc = db.savedStexAccounts[idx];
        if (acc) {
            if (db.stexCreds && db.stexCreds.email === acc.email) { db.stexCreds = null; db.stexToken = ""; }
            db.savedStexAccounts.splice(idx, 1);
            saveDB();
            bot.answerCallbackQuery(query.id, { text: "✅ Account removed successfully!" });
        } else {
            bot.answerCallbackQuery(query.id);
        }
        let btns = [];
        (db.savedStexAccounts || []).forEach((a, i) => {
            let activeMark = (db.stexCreds && db.stexCreds.email === a.email) ? "✅ " : "👤 ";
            btns.push([{ text: `${activeMark}${a.email}`, callback_data: `stex_qlogin_${i}` }]);
        });
        if (db.savedStexAccounts.length > 0) btns.push([{ text: "Remove Account", callback_data: "stex_remove_menu" }]);
        btns.push([{ text: "Add Account", callback_data: "stex_manual_login" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_panel" }]);
        bot.editMessageText("🔑 **Stex SMS Login:**\nChoose an account to login or add a new one:",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
    }

    else if (data === "stex_manual_login") {
        userStates[chatId] = "WAITING_FOR_STEX_CREDS";
        bot.sendMessage(chatId, "📧 **Send Stex credentials format:**\n`email|password`", { parse_mode: "Markdown" }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("stex_qlogin_")) {
        const idx = parseInt(data.replace("stex_qlogin_", ""));
        const acc = db.savedStexAccounts[idx];
        if (acc) {
            bot.sendMessage(chatId, "⏳ Logging into StexSMS...").catch(() => {});
            stex.login(acc.email, acc.password).then(token => {
                db.stexToken = token; db.stexCreds = acc; saveDB();
                bot.sendMessage(chatId, "✅ Stex Login Successful! Token is saved.").catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ Failed: " + e.message).catch(() => {}));
        }
        bot.answerCallbackQuery(query.id);
    }

    // ── MK: Account Management ───────────────────────────────
    else if (data === "placeholder_mk_login") {
        let btns = [];
        if (db.savedMkAccounts && db.savedMkAccounts.length > 0) {
            db.savedMkAccounts.forEach((acc, idx) => {
                let activeMark = (db.mkCreds && db.mkCreds.email === acc.email) ? "✅ " : "👤 ";
                btns.push([{ text: `${activeMark}${acc.email}`, callback_data: `mk_qlogin_${idx}` }]);
            });
            btns.push([{ text: "Remove Account", callback_data: "mk_remove_menu" }]);
        }
        btns.push([{ text: "Add Account", callback_data: "mk_manual_login" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_panel" }]);
        bot.editMessageText("🔑 **MK SMS Login:**\nChoose an account to login or add a new one:",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "mk_remove_menu") {
        let btns = [];
        (db.savedMkAccounts || []).forEach((acc, idx) => {
            btns.push([{ text: `❌ ${acc.email}`, callback_data: `mk_delacc_${idx}` }]);
        });
        btns.push([{ text: "⬅️ Back", callback_data: "placeholder_mk_login" }]);
        bot.editMessageText("🗑️ **Select an account to remove:**",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("mk_delacc_")) {
        const idx = parseInt(data.replace("mk_delacc_", ""));
        const acc = db.savedMkAccounts[idx];
        if (acc) {
            if (db.mkCreds && db.mkCreds.email === acc.email) { db.mkCreds = null; db.mkCookies = ""; }
            db.savedMkAccounts.splice(idx, 1);
            saveDB();
            bot.answerCallbackQuery(query.id, { text: "✅ Account removed successfully!" });
        } else {
            bot.answerCallbackQuery(query.id);
        }
        let btns = [];
        (db.savedMkAccounts || []).forEach((a, i) => {
            let activeMark = (db.mkCreds && db.mkCreds.email === a.email) ? "✅ " : "👤 ";
            btns.push([{ text: `${activeMark}${a.email}`, callback_data: `mk_qlogin_${i}` }]);
        });
        if (db.savedMkAccounts.length > 0) btns.push([{ text: "Remove Account", callback_data: "mk_remove_menu" }]);
        btns.push([{ text: "Add Account", callback_data: "mk_manual_login" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_panel" }]);
        bot.editMessageText("🔑 **MK SMS Login:**\nChoose an account to login or add a new one:",
            { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
        ).catch(() => {});
    }

    else if (data === "mk_manual_login") {
        userStates[chatId] = "WAITING_FOR_MK_CREDS";
        bot.sendMessage(chatId, "📧 **Send MK SMS credentials format:**\n`email|password`", { parse_mode: "Markdown" }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data.startsWith("mk_qlogin_")) {
        const idx = parseInt(data.replace("mk_qlogin_", ""));
        const acc = db.savedMkAccounts[idx];
        if (acc) {
            bot.sendMessage(chatId, "⏳ Logging into MK SMS Server...").catch(() => {});
            mk.login(acc.email, acc.password).then(cookieStr => {
                db.mkCookies = cookieStr; db.mkCreds = acc; saveDB();
                bot.sendMessage(chatId, "✅ MK SMS Login Successful!", { parse_mode: "Markdown" }).catch(() => {});
            }).catch(e => bot.sendMessage(chatId, "❌ **Failed:** " + e.message, { parse_mode: "Markdown" }).catch(() => {}));
        }
        bot.answerCallbackQuery(query.id);
    }

    // ── Manage Numbers ───────────────────────────────────────
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

    else if (data === "placeholder_stex") {
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        userStates[chatId] = "WAITING_FOR_STEX_RANGE";
        bot.sendMessage(chatId,
            `🔢 **Enter Stex Range for ${platform.toUpperCase()}:**\nJust type the range, the bot will automatically detect the country.\nExample: \`23276XXX\``,
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "placeholder_mk") {
        const platform = tempAdminData[chatId]?.selectedPlatform || "fb";
        userStates[chatId] = "WAITING_FOR_MK_RANGE";
        bot.sendMessage(chatId,
            `🔢 **Enter MK Range for ${platform.toUpperCase()}:**\nJust type the range, the bot will automatically detect the country.\nExample: \`23276XXX\``,
            { parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "placeholder_iva") {
        bot.answerCallbackQuery(query.id, { text: "🛠 This service/logic is not integrated yet.", show_alert: true });
    }

    // ── Remove Number/Range ──────────────────────────────────
    else if (data === "admin_remove_number_menu") {
        let btns = [];
        ["fb", "ig", "wa"].forEach(plat => {
            const stexList = db.stexRanges[plat] ? Object.keys(db.stexRanges[plat]) : [];
            stexList.forEach(r => {
                const cName = typeof db.stexRanges[plat][r] === "object" ? db.stexRanges[plat][r].country : db.stexRanges[plat][r];
                const info  = getCountryInfo(cName);
                btns.push([{ text: `Stex : ${info.flag} ${info.cleanName} (${r})`, callback_data: `delstexrng_${plat}_${r}` }]);
            });
            const mkList = db.mkRanges && db.mkRanges[plat] ? Object.keys(db.mkRanges[plat]) : [];
            mkList.forEach(r => {
                const cName = typeof db.mkRanges[plat][r] === "object" ? db.mkRanges[plat][r].country : db.mkRanges[plat][r];
                const info  = getCountryInfo(cName);
                btns.push([{ text: `MK : ${info.flag} ${info.cleanName} (${r})`, callback_data: `delmkrng_${plat}_${r}` }]);
            });
            const ivaList = db.availableNumbers[plat] ? Object.keys(db.availableNumbers[plat]).filter(k => db.availableNumbers[plat][k].length > 0) : [];
            ivaList.forEach(r => {
                const info = getCountryInfo(r);
                btns.push([{ text: `IVA : ${info.flag} ${info.cleanName} (${r})`, callback_data: `delnumrng_${plat}_${r}` }]);
            });
        });
        if (btns.length === 0) return bot.answerCallbackQuery(query.id, { text: "📭 No active numbers/ranges to remove.", show_alert: true });
        btns.push([{ text: "🗑️ REMOVE ALL", callback_data: "delall_everything" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]);
        bot.editMessageText("🗑️ **Select a range to remove:**\n_(This will delete the available numbers/ranges from the bot)_",
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    else if (data === "delall_everything") {
        db.stexRanges = { fb: {}, ig: {}, wa: {} };
        db.mkRanges   = { fb: {}, ig: {}, wa: {} };
        db.availableNumbers = { fb: {}, ig: {}, wa: {} };
        saveDB();
        bot.answerCallbackQuery(query.id, { text: "✅ All Numbers and Ranges removed successfully!", show_alert: true });
        bot.editMessageText("🗑️ **All numbers/ranges have been removed.**",
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]] }, parse_mode: "Markdown" }
        ).catch(() => {});
    }

    else if (data.startsWith("delnumrng_") || data.startsWith("delstexrng_") || data.startsWith("delmkrng_")) {
        const isStex    = data.startsWith("delstexrng_");
        const isMk      = data.startsWith("delmkrng_");
        const prefixStr = isStex ? "delstexrng_" : (isMk ? "delmkrng_" : "delnumrng_");
        const payload   = data.replace(prefixStr, "");
        const parts     = payload.split("_");
        const plat      = parts[0];
        const target    = parts.slice(1).join("_");

        if (isStex) {
            if (db.stexRanges[plat] && db.stexRanges[plat][target]) { delete db.stexRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ Stex range ${target} removed from ${plat.toUpperCase()}!` });
        } else if (isMk) {
            if (db.mkRanges && db.mkRanges[plat] && db.mkRanges[plat][target]) { delete db.mkRanges[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ MK range ${target} removed from ${plat.toUpperCase()}!` });
        } else {
            if (db.availableNumbers[plat] && db.availableNumbers[plat][target]) { delete db.availableNumbers[plat][target]; saveDB(); }
            bot.answerCallbackQuery(query.id, { text: `✅ ${target} numbers removed from ${plat.toUpperCase()}!` });
        }

        let btns = [];
        ["fb", "ig", "wa"].forEach(p => {
            const stexList = db.stexRanges[p] ? Object.keys(db.stexRanges[p]) : [];
            stexList.forEach(r => {
                const cName = typeof db.stexRanges[p][r] === "object" ? db.stexRanges[p][r].country : db.stexRanges[p][r];
                btns.push([{ text: `Stex : ${getCountryInfo(cName).flag} ${getCountryInfo(cName).cleanName} (${r})`, callback_data: `delstexrng_${p}_${r}` }]);
            });
            const mkList = db.mkRanges && db.mkRanges[p] ? Object.keys(db.mkRanges[p]) : [];
            mkList.forEach(r => {
                const cName = typeof db.mkRanges[p][r] === "object" ? db.mkRanges[p][r].country : db.mkRanges[p][r];
                btns.push([{ text: `MK : ${getCountryInfo(cName).flag} ${getCountryInfo(cName).cleanName} (${r})`, callback_data: `delmkrng_${p}_${r}` }]);
            });
            const ivaList = db.availableNumbers[p] ? Object.keys(db.availableNumbers[p]).filter(k => db.availableNumbers[p][k].length > 0) : [];
            ivaList.forEach(r => {
                btns.push([{ text: `IVA : ${getCountryInfo(r).flag} ${getCountryInfo(r).cleanName} (${r})`, callback_data: `delnumrng_${p}_${r}` }]);
            });
        });
        if (btns.length === 0) {
            bot.editMessageText("🛠 **Please select the platform for managing numbers:**",
                { chat_id: chatId, message_id: messageId, reply_markup: adminPlatformMenu }
            ).catch(() => {});
            return;
        }
        btns.push([{ text: "🗑️ REMOVE ALL", callback_data: "delall_everything" }]);
        btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]);
        bot.editMessageText("🗑️ **Select a range to remove:**\n_(This will delete the available numbers/ranges from the bot)_",
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }
        ).catch(() => {});
    }

    // ── IVA Ranges Management ────────────────────────────────
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

    // ── Manage Admins ────────────────────────────────────────
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

    // ── Withdraw ─────────────────────────────────────────────
    else if (data === "withdraw_funds") {
        userStates[chatId] = "WAITING_FOR_BKASH";
        bot.sendMessage(chatId, "💸 **Please enter your 11-digit bKash or Nagad number:**").catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    // ── Country Selection Menu ───────────────────────────────
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
        const stexPlatformDB  = db.stexRanges[platform] || {};
        const mkPlatformDB    = db.mkRanges && db.mkRanges[platform] ? db.mkRanges[platform] : {};

        const ranges       = Object.keys(availPlatformDB).filter(k => availPlatformDB[k].length > 0);
        const stexRangesList = Object.keys(stexPlatformDB);
        const mkRangesList   = Object.keys(mkPlatformDB);

        if (ranges.length === 0 && stexRangesList.length === 0 && mkRangesList.length === 0)
            return bot.editMessageText(`⚠️ We are currently out of stock for this platform. Please check back later.`,
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "menu_platform" }]] } }
            ).catch(() => {});

        let combinedRanges = [];
        ranges.forEach(r       => combinedRanges.push({ type: "iva",  range: r, info: getCountryInfo(r) }));
        stexRangesList.forEach(r => combinedRanges.push({ type: "stex", range: r, info: getCountryInfo(typeof stexPlatformDB[r] === "object" ? stexPlatformDB[r].country : stexPlatformDB[r]) }));
        mkRangesList.forEach(r   => combinedRanges.push({ type: "mk",   range: r, info: getCountryInfo(typeof mkPlatformDB[r]   === "object" ? mkPlatformDB[r].country   : mkPlatformDB[r]) }));
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
            countryButtons.push([{ text: `${dName} | 📦: ${stock}`, callback_data: `assign_${platform}_${item.range}` }]);
        });
        countryButtons.push([{ text: "✖ Close Menu", callback_data: "close_menu" }, { text: "⬅️ Back", callback_data: "menu_platform" }]);
        bot.editMessageText(`🌍 Select a country from the available options:`,
            { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: countryButtons } }
        ).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }

    // ── Number Assignment (IVA / Stex / MK) ─────────────────
    else if (data.startsWith("assign_")) {
        if (activeNumberMessages[chatId] && activeNumberMessages[chatId] !== messageId)
            bot.deleteMessage(chatId, activeNumberMessages[chatId]).catch(() => {});
        delete activeNumberMessages[chatId];

        const pureData       = data.replace("assign_next_", "").replace("assign_", "");
        const firstUnderscore = pureData.indexOf("_");
        const platform        = pureData.substring(0, firstUnderscore);
        const sel             = pureData.substring(firstUnderscore + 1);

        clearPendingForChat(chatId);

        // ── Stex Assignment
        if (db.stexRanges[platform] && db.stexRanges[platform][sel]) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const stexEntry   = db.stexRanges[platform][sel];
            const countryName = typeof stexEntry === "object" ? stexEntry.country : stexEntry;
            const methodName  = typeof stexEntry === "object" ? stexEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
            ).catch(() => {});

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await stex.getNumber(sel);
                    const n = numData.full_number || numData.number.replace("+", "");
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, isStex: true, platform };
                    }
                } catch (e) {
                    console.log(`[STEX Fetch Error - Attempt ${i + 1}]:`, e.message);
                    if (i === 0 && e.message.includes("SESSION_EXPIRED") && db.stexCreds?.email) {
                        try {
                            const token = await stex.login(db.stexCreds.email, db.stexCreds.password);
                            db.stexToken = token; stex.setAuthToken(token); saveDB();
                            const retryData = await stex.getNumber(sel);
                            const retryN    = retryData.full_number || retryData.number.replace("+", "");
                            if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isStex: true, platform }; continue; }
                        } catch (err2) { console.log(`[STEX On-Demand Login Failed]:`, err2.message); break; }
                    }
                    break;
                }
            }

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
                [{ text: "🔄 Change", callback_data: `assign_next_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                setTimeout(() => {
                    fetchedNums.forEach(n => { if (pendingRequests[n]) { delete pendingRequests[n]; delete inUseNumbers[n]; } });
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        // ── MK Assignment
        if (db.mkRanges && db.mkRanges[platform] && db.mkRanges[platform][sel]) {
            bot.answerCallbackQuery(query.id, { text: "⏳ Fetching numbers...", show_alert: false });
            const limit       = db.settings.maxNumbers || 4;
            const mkEntry     = db.mkRanges[platform][sel];
            const countryName = typeof mkEntry === "object" ? mkEntry.country : mkEntry;
            const methodName  = typeof mkEntry === "object" ? mkEntry.method  : "";
            let fetchedNums   = [];

            bot.editMessageText(`⏳ **Fetching ${limit} numbers...**`,
                { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }
            ).catch(() => {});
            if (db.mkCookies) mk.setCookies(db.mkCookies);

            for (let i = 0; i < limit; i++) {
                try {
                    const numData = await mk.getNumber(sel);
                    const n = numData.number ? numData.number.replace("+", "") : "";
                    if (n) {
                        fetchedNums.push(n);
                        inUseNumbers[n]    = true;
                        pendingRequests[n] = { chatId, country: countryName, isMk: true, platform };
                    }
                } catch (e) {
                    console.log(`[MK Fetch Error - Attempt ${i + 1}]:`, e.message);
                    if (i === 0 && e.message === "SESSION_EXPIRED" && db.mkCreds?.email) {
                        try {
                            const newCookie = await mk.login(db.mkCreds.email, db.mkCreds.password);
                            db.mkCookies = newCookie; mk.setCookies(newCookie); saveDB();
                            const retryData = await mk.getNumber(sel);
                            const retryN    = retryData.number ? retryData.number.replace("+", "") : "";
                            if (retryN) { fetchedNums.push(retryN); inUseNumbers[retryN] = true; pendingRequests[retryN] = { chatId, country: countryName, isMk: true, platform }; continue; }
                        } catch (err2) { console.log(`[MK On-Demand Login Failed]:`, err2.message); break; }
                    }
                    break;
                }
            }

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
                [{ text: "🔄 Change", callback_data: `assign_next_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
                [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
            );

            bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
                activeNumberMessages[chatId] = messageId;
                setTimeout(() => {
                    fetchedNums.forEach(n => { if (pendingRequests[n]) { delete pendingRequests[n]; delete inUseNumbers[n]; } });
                    let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}`;
                    if (methodName) expiredText += `\n📝 **Method:** ${methodName}`;
                    expiredText += `\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                    fetchedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                    bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
                }, 15 * 60 * 1000);
            }).catch(() => {});
            return;
        }

        // ── IVA Assignment (Manual Numbers)
        const nums = db.availableNumbers[platform][sel] || [];
        if (nums.length === 0)
            return bot.answerCallbackQuery(query.id, { text: `⚠️ This country is currently out of stock!`, show_alert: true });

        const limit       = db.settings.maxNumbers || 4;
        const assignedNums = nums.splice(0, limit);
        db.lastAssigned[chatId] = { country: sel, nums: [...assignedNums] };
        saveDB();

        assignedNums.forEach(n => { inUseNumbers[n] = true; pendingRequests[n] = { chatId, country: sel, platform }; });

        const info    = getCountryInfo(sel);
        let platName  = platform === "fb" ? "FACEBOOK" : platform === "ig" ? "INSTAGRAM" : "WHATSAPP";
        let replyText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}\n\n👇 _Click a number below to copy:_`;

        let actionMenu = { inline_keyboard: [] };
        assignedNums.forEach(n => actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]));
        actionMenu.inline_keyboard.push(
            [{ text: "🔄 Change", callback_data: `assign_next_${platform}_${sel}` }, { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }],
            [{ text: "🔙 Back",  callback_data: `menu_country_${platform}` }]
        );

        bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => {
            activeNumberMessages[chatId] = messageId;
            setTimeout(() => {
                assignedNums.forEach(n => { if (pendingRequests[n]) { delete pendingRequests[n]; delete inUseNumbers[n]; } });
                let expiredText = `**${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 **Platform:** ${platName}\n\n⚠️ **Status:** 🔴 **EXPIRED (15m validity ended)**\n\n`;
                assignedNums.forEach(n => { expiredText += `~~${info.flag} +${n}~~\n`; });
                bot.editMessageText(expiredText, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Next ➡️", callback_data: `assign_next_${platform}_${sel}` }], [{ text: "🔙 Back", callback_data: `menu_country_${platform}` }]] }, parse_mode: "Markdown" }).catch(() => {});
            }, 15 * 60 * 1000);
        }).catch(() => {});
        bot.answerCallbackQuery(query.id);
    }
});


// ============================================================
// #  OTP PROCESSING FUNCTION
// ============================================================

function processFoundOTP(number, time, message, range) {
    const uniqueId = `${number}_${time}`;
    if (lastProcessedOTPTime[uniqueId]) return;
    lastProcessedOTPTime[uniqueId] = true;

    let otpMatch = message.match(/\b\d{5,8}\b/);
    let otpCode  = otpMatch ? otpMatch[0] : null;

    const cName   = typeof range === "object" ? range.country : range;
    const info    = getCountryInfo(cName || "UNKNOWN");
    const numStr  = String(number);
    const maskedGroupNumber = (numStr.length < 7) ? numStr : `${numStr.slice(0, 4)}XXXX${numStr.slice(-3)}`;

    let reqData  = pendingRequests[number];
    let platCode = reqData ? reqData.platform : "unknown";
    let platName = platCode === "fb" ? "FACEBOOK" : platCode === "ig" ? "INSTAGRAM" : platCode === "wa" ? "WHATSAPP" : platCode.toUpperCase();

    // Send to group
    let groupReplyText = `☁️ eSIM OTP ☁️\n✉️ New OTP Received 🔥\n\n🌍 Country: ${info.flag} ${info.cleanName.toUpperCase()}\n🌐 Platform: ${platName}\n📞 Number: ${maskedGroupNumber}\n✉️ Full SMS:\n> ${message}`;
    let groupMarkup    = { inline_keyboard: [] };
    let groupButtonRow = [];
    if (botInfo?.username) groupButtonRow.push({ text: "📞 Get Number", url: `https://t.me/${botInfo.username}` });
    if (otpCode)           groupButtonRow.push({ text: `COPY OTP`, copy_text: { text: otpCode } });
    if (groupButtonRow.length > 0) groupMarkup.inline_keyboard.push(groupButtonRow);
    bot.sendMessage(GROUP_CHAT_ID, groupReplyText,
        { parse_mode: "Markdown", reply_markup: groupMarkup.inline_keyboard.length > 0 ? groupMarkup : undefined }
    ).catch(() => {});

    // Send to user
    if (reqData) {
        const reqInfo    = getCountryInfo(cName);
        let userReplyText = `☁️ eSIM OTP ☁️\n✉️ New OTP Received 🔥\n\n🌍 Country: ${reqInfo.flag} ${reqInfo.cleanName.toUpperCase()}\n🌐 Platform: ${platName}\n📞 Number: \`${number}\`\n✉️ Full SMS:\n> ${message}`;
        let userMarkup   = { inline_keyboard: [] };
        if (otpCode) userMarkup.inline_keyboard.push([{ text: `COPY OTP`, copy_text: { text: otpCode } }]);
        bot.sendMessage(reqData.chatId, userReplyText,
            { parse_mode: "Markdown", reply_markup: userMarkup.inline_keyboard.length > 0 ? userMarkup : undefined }
        ).catch(() => {});
        addBalance(reqData.chatId, 0.50);
        delete pendingRequests[number];
        delete inUseNumbers[number];
    }
}


// ============================================================
// #  EXPRESS API ROUTES
// ============================================================

// IVA Extension: Receive Ranges & SMS
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

// Health check routes
app.get("/",     (req, res) => res.status(200).send("Bot is successfully running on Hybrid Mode!"));
app.get("/ping", (req, res) => res.status(200).send("Pong! Bot is alive."));


// ============================================================
// #  AUTO-LOGIN FUNCTION  (Stex & MK)
// ============================================================

async function autoLoginPanels() {
    if (!isDbLoaded) return;

    if (db.stexCreds && db.stexCreds.email) {
        try {
            const token = await stex.login(db.stexCreds.email, db.stexCreds.password);
            if (token) { db.stexToken = token; stex.setAuthToken(token); saveDB(); }
        } catch (e) { console.log("[Auto-Login Loop Error STEX]:", e.message); }
    }

    if (db.mkCreds && db.mkCreds.email) {
        try {
            const cookieStr = await mk.login(db.mkCreds.email, db.mkCreds.password);
            if (cookieStr) { db.mkCookies = cookieStr; mk.setCookies(cookieStr); saveDB(); }
        } catch (e) { console.log("[Auto-Login Loop Error MK]:", e.message); }
    }
}


// ============================================================
// #  DATABASE CONNECTION & SERVER START
// ============================================================

mongoose.connect(MONGODB_URI).then(async () => {
    const data = await BotDB.findOne();
    if (data) {
        db = { ...db, ...data.toObject() };

        // Migration: flat → nested availableNumbers
        if (!db.availableNumbers.fb && !db.availableNumbers.ig && !db.availableNumbers.wa) {
            const oldData = { ...db.availableNumbers };
            db.availableNumbers = { fb: oldData, ig: {}, wa: {} };
        }
        // Migration: stexRanges
        if (!db.stexRanges) db.stexRanges = { fb: {}, ig: {}, wa: {} };
        if (!db.stexRanges.fb && !db.stexRanges.ig && !db.stexRanges.wa) {
            const oldStex = { ...db.stexRanges };
            db.stexRanges = { fb: oldStex, ig: {}, wa: {} };
        }
        // Defaults
        if (!db.mkRanges)            db.mkRanges           = { fb: {}, ig: {}, wa: {} };
        if (!db.savedStexAccounts)   db.savedStexAccounts  = [];
        if (!db.savedMkAccounts)     db.savedMkAccounts    = [];

        // Migrate single creds → saved accounts array
        if (db.stexCreds?.email && db.savedStexAccounts.length === 0) db.savedStexAccounts.push(db.stexCreds);
        if (db.mkCreds?.email   && db.savedMkAccounts.length   === 0) db.savedMkAccounts.push(db.mkCreds);

    } else {
        await BotDB.create(db);
    }

    if (db.stexToken)  stex.setAuthToken(db.stexToken);
    if (db.mkCookies)  mk.setCookies(db.mkCookies);

    isDbLoaded = true;
    app.listen(PORT, () => console.log(`🚀 Hybrid Mode running on port ${PORT}`));

    setTimeout(autoLoginPanels, 10000);

}).catch(err => console.log(err));


// ============================================================
// #  BACKGROUND POLLING INTERVALS
// ============================================================

// Auto re-login every 20 minutes
setInterval(autoLoginPanels, 20 * 60 * 1000);

// Stex OTP polling — every 2.5 seconds
setInterval(async () => {
    if (!db.stexToken) return;
    const hasStexPending = Object.values(pendingRequests).some(req => req.isStex);
    if (!hasStexPending) return;

    try {
        const d       = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
        d.setHours(d.getHours() - 4);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const records = await stex.checkInfo(dateStr);
        if (Array.isArray(records)) {
            records.forEach(rec => {
                let num = rec.number ? String(rec.number).replace("+", "") : null;
                if (num && pendingRequests[num]) {
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
}, 2500);

// MK OTP polling — every 2.5 seconds
setInterval(async () => {
    if (!db.mkCookies) return;
    const hasMkPending = Object.values(pendingRequests).some(req => req.isMk);
    if (!hasMkPending) return;

    try {
        if (db.mkCookies) mk.setCookies(db.mkCookies);
        const d       = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const records = await mk.checkInfo(dateStr);

        if (Array.isArray(records)) {
            records.forEach(rec => {
                let rawNum      = String(rec.phone_number || rec.number || "");
                let cleanRecNum = rawNum.replace(/\D/g, "");
                if (cleanRecNum) {
                    let pendingKey = Object.keys(pendingRequests).find(
                        k => k.replace(/\D/g, "") === cleanRecNum && pendingRequests[k].isMk
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
}, 2500);
