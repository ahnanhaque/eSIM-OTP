const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const { authenticator } = require("otplib"); 
const iva = require("./iva"); // Import the updated iva.js

// ==============================================================================
// =================        1. CONFIGURATION & SETUP         ====================
// ==============================================================================

// ⚠️ YOUR BOT CONFIGURATION HERE
const botToken = "8529122267:AAEjUc_8-EcNeHnwP1YPT6FX8wB51k35qKg"; 
const ADMIN_ID = 8278612952; 
const GROUP_CHAT_ID = -1003852968469; 
const GROUP_INVITE_LINK = "https://t.me/+x_1_25vVZJswNWM1"; 

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

const bot = new TelegramBot(botToken, { 
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
    request: { agentOptions: { keepAlive: true, family: 4 } }
});

// 🟢 গ্লোবাল এরর ফিল্টার: অপ্রয়োজনীয় editMessageText এরর হাইড করার জন্য
bot.on("polling_error", (err) => {
    if (err && err.message && !err.message.includes("message is not modified")) console.log("\n[Telegram Polling Error]", err.message);
});
bot.on("error", (err) => {
    if (err && err.message && !err.message.includes("message is not modified")) console.log("\n[Telegram Bot Error]", err.message);
});

bot.setMyCommands([
  { command: 'start', description: 'Restart the bot' },
  { command: 'admin', description: 'Open admin panel' }
]);

let botInfo = {};
bot.getMe().then(info => botInfo = info).catch(console.error);

// ==============================================================================
// =================   2. DATABASE & BOT HELPERS             ====================
// ==============================================================================
const DB_FILE = "./database.json";
let db = { balances: {}, lastAssigned: {}, adminUsernames: [], users: [], referred: {}, settings: { maxNumbers: 4 }, availableNumbers: {}, cookies: {} };

if (fs.existsSync(DB_FILE)) {
  const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  db = { ...db, ...parsed };
  if (!db.lastAssigned) db.lastAssigned = {};
  if (!db.adminUsernames) db.adminUsernames = [];
  if (!db.users) db.users = [];
  if (!db.referred) db.referred = {};
  if (!db.settings) db.settings = { maxNumbers: 4 };
  if (!db.availableNumbers) db.availableNumbers = {};
  if (!db.cookies || !db.cookies["ivas_sms_session"]) {
      db.cookies = { "XSRF-TOKEN": "", "ivas_sms_session": "" };
  }
} else {
  db.cookies = { "XSRF-TOKEN": "", "ivas_sms_session": "" };
}

// 🔄 Sync cookies with iva.js engine on startup
if (db.cookies && db.cookies["XSRF-TOKEN"]) {
    iva.setCookies(db.cookies["XSRF-TOKEN"], db.cookies["ivas_sms_session"]);
}

function saveDB() {
  fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error("Database Save Error:", err);
  });
}

function getBalance(chatId) { return db.balances[chatId] || 0; }
function addBalance(chatId, amount) {
  if (!db.balances[chatId]) db.balances[chatId] = 0;
  db.balances[chatId] += amount;
  saveDB();
}

function isSuperAdmin(chatId) { return chatId === ADMIN_ID; }
function isAdmin(chatId, username) {
  if (isSuperAdmin(chatId)) return true;
  let un = username ? "@" + username.replace('@', '').toLowerCase() : null;
  return un && db.adminUsernames.includes(un);
}

async function isUserMember(userId) {
  if (isSuperAdmin(userId)) return true; 
  try {
    const member = await bot.getChatMember(GROUP_CHAT_ID, userId);
    return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
  } catch (err) { return false; }
}

function sendJoinPrompt(chatId) {
  const joinMenu = {
    inline_keyboard: [
      [{ text: "📢 Join Group", url: GROUP_INVITE_LINK }],
      [{ text: "🔄 Check Again", callback_data: "check_join" }]
    ]
  };
  bot.sendMessage(chatId, `⚠️ **Access Denied!**\n\nTo use this bot, you must first join our official group.\n\nAfter joining, click **Check Again**.`, { reply_markup: joinMenu, parse_mode: "Markdown" }).catch(()=>{});
}

function sendStockAlert(rangeName, count) {
  if (count <= 0) return;
  const info = getCountryInfo(rangeName);
  const alertMsg = `🚀 **NEW STOCK ALERT** 🚀\n\n` +
                   `🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n` +
                   `📦 **Available:** ${count} Numbers\n` +
                   `🔵 **Service:** FACEBOOK OTP\n\n` +
                   `☎️ [Order Now - Click Here](https://t.me/${botInfo.username || "eSIM_OTP_Bot"})`;
  bot.sendMessage(GROUP_CHAT_ID, alertMsg, { parse_mode: "Markdown", disable_web_page_preview: true }).catch(()=>{});
}

function detectPlatform(from, subject, body) {
    let str = (from + " " + subject + " " + (body || "")).toLowerCase();
    if (str.includes("facebook")) return "Facebook";
    if (str.includes("instagram")) return "Instagram";
    if (str.includes("whatsapp")) return "WhatsApp";
    if (str.includes("tiktok")) return "TikTok";
    if (str.includes("google")) return "Google";
    if (str.includes("twitter") || str.includes("x.com")) return "X (Twitter)";
    if (str.includes("telegram")) return "Telegram";
    if (str.includes("discord")) return "Discord";
    if (str.includes("owlproxy")) return "OwlProxy";
    
    let domainMatch = from.match(/@([a-zA-Z0-9.-]+)\./);
    if (domainMatch) {
        let domain = domainMatch[1].replace(/mail|security|info|noreply/ig, "");
        if (domain.length > 2) return domain.charAt(0).toUpperCase() + domain.slice(1);
        return domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
    }
    return "Unknown Platform";
}

let pendingRequests = {};  
let lastProcessedOTPTime = {}; 
let inUseNumbers = {}; 
let userStates = {}; 
let tempAdminData = {}; 
let activeTempMails = {};
let cachedToken = null;

// Keep Session Active
setInterval(async () => {
  try {
    const token = await iva.fetchToken();
    if (token) {
      cachedToken = token;
      console.log(`[Keep-Alive] Session active.`);
    }
  } catch (error) {}
}, 3 * 60 * 1000); 

// ==============================================================================
// =================   3. BOT DESIGN & COMPREHENSIVE COUNTRY DATA ================
// ==============================================================================
const countryData = {
  // Most Common iVAS Countries
  "TUNISIA": { flag: "🇹🇳" }, "ETHIOPIA": { flag: "🇪🇹" }, "CENTRAL AFRICA": { flag: "🇨🇫" }, 
  "MONGOLIA": { flag: "🇲🇳" }, "MYANMAR": { flag: "🇲🇲" }, "CAMEROON": { flag: "🇨🇲" }, 
  "MALI": { flag: "🇲🇱" }, "PERU": { flag: "🇵🇪" }, "EGYPT": { flag: "🇪🇬" }, 
  "GUINEA": { flag: "🇬🇳" }, "IVORY COAST": { flag: "🇨🇮" }, "COTE D IVOIRE": { flag: "🇨🇮" }, 
  "SENEGAL": { flag: "🇸🇳" }, "NIGERIA": { flag: "🇳🇬" }, "GHANA": { flag: "🇬🇭" }, 
  "KENYA": { flag: "🇰🇪" }, "SOUTH AFRICA": { flag: "🇿🇦" }, "MOROCCO": { flag: "🇲🇦" }, 
  "BRAZIL": { flag: "🇧🇷" }, "MEXICO": { flag: "🇲🇽" }, "INDIA": { flag: "🇮🇳" }, 
  "BANGLADESH": { flag: "🇧🇩" }, "PAKISTAN": { flag: "🇵🇰" }, "PHILIPPINES": { flag: "🇵🇭" }, 
  "INDONESIA": { flag: "🇮🇩" }, "VIETNAM": { flag: "🇻🇳" }, "THAILAND": { flag: "🇹🇭" }, 
  "USA": { flag: "🇺🇸" }, "UNITED STATES": { flag: "🇺🇸" }, "UK": { flag: "🇬🇧" }, 
  "UNITED KINGDOM": { flag: "🇬🇧" }, "FRANCE": { flag: "🇫🇷" }, "GERMANY": { flag: "🇩🇪" }, 
  "ITALY": { flag: "🇮🇹" }, "SPAIN": { flag: "🇪🇸" }, "COLOMBIA": { flag: "🇨🇴" }, 
  "ARGENTINA": { flag: "🇦🇷" }, "TURKEY": { flag: "🇹🇷" }, "RUSSIA": { flag: "🇷🇺" }, 
  "UKRAINE": { flag: "🇺🇦" }, "KAZAKHSTAN": { flag: "🇰🇿" }, "MACAU": { flag: "🇲🇴" }, 
  "HONG KONG": { flag: "🇭🇰" }, "MALAYSIA": { flag: "🇲🇾" }, "CAMBODIA": { flag: "🇰🇭" }, 
  "LAOS": { flag: "🇱🇦" }, "SRI LANKA": { flag: "🇱🇰" }, "NEPAL": { flag: "🇳🇵" }, 
  "ALGERIA": { flag: "🇩🇿" }, "MADAGASCAR": { flag: "🇲🇬" }, "ROMANIA": { flag: "🇷🇴" }, 
  "POLAND": { flag: "🇵🇱" }, "PORTUGAL": { flag: "🇵🇹" }, "NETHERLANDS": { flag: "🇳🇱" }, 
  "SWEDEN": { flag: "🇸🇪" }, "UZBEKISTAN": { flag: "🇺🇿" }, "KYRGYZSTAN": { flag: "🇰🇬" }, 
  "SOUTH KOREA": { flag: "🇰🇷" }, "JAPAN": { flag: "🇯🇵" },
  
  // Extra Range Enhancements
  "MACEDONIA": { flag: "🇲🇰" }, "ZAMBIA": { flag: "🇿🇲" }, "ZIMBABWE": { flag: "🇿🇼" }, 
  "CHILE": { flag: "🇨🇱" }, "VENEZUELA": { flag: "🇻🇪" }, "BOLIVIA": { flag: "🇧🇴" }, 
  "PARAGUAY": { flag: "🇵🇾" }, "ECUADOR": { flag: "🇪🇨" }, "ANGOLA": { flag: "🇦🇴" }, 
  "UGANDA": { flag: "🇺🇬" }, "TANZANIA": { flag: "🇹🇿" }, "RWANDA": { flag: "🇷🇼" }, 
  "SAUDI ARABIA": { flag: "🇸🇦" }, "UAE": { flag: "🇦🇪" }, "IRAQ": { flag: "🇮🇶" }, 
  "IRAN": { flag: "🇮🇷" }, "TAIWAN": { flag: "🇹🇼" }, "SINGAPORE": { flag: "🇸🇬" }, 
  "AUSTRALIA": { flag: "🇦🇺" }, "CANADA": { flag: "🇨🇦" }, "CONGO": { flag: "🇨🇩" }, 
  "MOLDOVA": { flag: "🇲🇩" }, "SERBIA": { flag: "🇷🇸" }, "CROATIA": { flag: "🇭🇷" }, 
  "BULGARIA": { flag: "🇧🇬" }, "LITHUANIA": { flag: "🇱🇹" }, "LATVIA": { flag: "🇱🇻" }, 
  "ESTONIA": { flag: "🇪🇪" }, "FINLAND": { flag: "🇫🇮" }, "NORWAY": { flag: "🇳🇴" }, 
  "DENMARK": { flag: "🇩🇰" }, "TAJIKISTAN": { flag: "🇹🇯" }, "BELARUS": { flag: "🇧🇾" },
  "GEORGIA": { flag: "🇬🇪" }, "ARMENIA": { flag: "🇬🇪" }, "AFGHANISTAN": { flag: "🇦🇫" },
  "SYRIA": { flag: "🇸🇾" }, "YEMEN": { flag: "🇾🇪" }, "OMAN": { flag: "🇴🇲" }
};

function getCountryInfo(countryName) {
  if (!countryName) return { flag: "🌍", cleanName: "Unknown" };
  const upperName = countryName.toUpperCase();
  let flag = "🌍";
  let cleanName = countryName.replace(/\s*[vV]?\d+.*$/, '').trim();

  for (const key in countryData) {
    if (upperName.includes(key)) {
      flag = countryData[key].flag;
      cleanName = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      break;
    }
  }
  if (flag === "🌍") cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { flag, cleanName };
}

function maskNumber(numStr) {
  if (!numStr || numStr.length < 6) return numStr;
  return `${numStr.slice(0, 4)}****${numStr.slice(-4)}`;
}

function clearPendingForChat(chatId) {
  for (let num in pendingRequests) {
    if (pendingRequests[num].chatId === chatId) {
      delete inUseNumbers[num]; delete pendingRequests[num];
    }
  }
}

function getReplyMenu(chatId, username) {
  let keyboard = [[{ text: "☎️ Get Number" }, { text: "📧 Temp Mail" }], [{ text: "🔑 2FA" }, { text: "👤 Profile" }]];
  if (isAdmin(chatId, username)) keyboard.push([{ text: "💬 Support" }, { text: "⚙️ Admin Panel" }]);
  else keyboard.push([{ text: "💬 Support" }]);
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

const platformMenu = { inline_keyboard: [[{ text: "📘 Facebook", callback_data: "menu_country_fb" }], [{ text: "❌ Close Menu", callback_data: "close_menu" }]] };

function getAdminMenu(chatId) {
  let menu = [
    [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" }, { text: "🔢 Set Number Limit", callback_data: "admin_set_limit" }],
    [{ text: "⚙️ Manage Ranges", callback_data: "admin_manage_ranges" }, { text: "📊 Check Stored Numbers", callback_data: "admin_check_db" }],
    [{ text: "🍪 Update Cookies", callback_data: "admin_update_cookies" }]
  ];
  if (isSuperAdmin(chatId)) menu.push([{ text: "👑 Manage Admins", callback_data: "admin_manage_admins" }, { text: "❌ Close Menu", callback_data: "close_menu" }]);
  else menu.push([{ text: "❌ Close Menu", callback_data: "close_menu" }]);
  return { inline_keyboard: menu };
}

// 🟢 NEW: Admin Platform Menu with Remove Option
const adminPlatformMenu = {
  inline_keyboard: [
    [{ text: "ⓕ Facebook", callback_data: "admin_sel_plat_fb" }],
    [{ text: "ⓘ Instagram", callback_data: "admin_sel_plat_ig" }],
    [{ text: "✆ WhatsApp", callback_data: "admin_sel_plat_wa" }],
    [{ text: "🗑️ Remove Number", callback_data: "admin_remove_number_menu" }], 
    [{ text: "⬅️ Back", callback_data: "admin_panel" }]
  ]
};

function renderManageRangesMenu(chatId, messageId) {
  const rangesArray = tempAdminData[chatId] || [];
  let rangeButtons = [];
  rangesArray.forEach((r, index) => {
    let info = getCountryInfo(r.name);
    let isAdded = db.availableNumbers[r.name] && db.availableNumbers[r.name].length > 0;
    let icon = isAdded ? "✅" : "❌";
    rangeButtons.push([{ text: `${icon} ${info.flag} ${r.name} (${r.nums.length})`, callback_data: `togglerng_${index}` }]);
  });
  rangeButtons.push([{ text: "📥 Add All", callback_data: "togglerng_addall" }, { text: "🗑️ Remove All", callback_data: "togglerng_delall" }]);
  rangeButtons.push([{ text: "🔄 Refresh List", callback_data: "refresh_manage_ranges" }]);
  rangeButtons.push([{ text: "⬅️ Back to Admin", callback_data: "admin_panel" }]);
  bot.editMessageText("⚙️ **Manage Ranges:**\n\nClick a range to toggle (✅ Added / ❌ Removed):", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rangeButtons }, parse_mode: "Markdown" }).catch(()=>{});
}

// ==============================================================================
// =================   4. TELEGRAM BOT HANDLERS                      ====================
// ==============================================================================

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id, username = msg.from.username;
  if (!await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);
  if (!db.users.includes(chatId)) {
      db.users.push(chatId);
      const refId = match[1];
      if (refId && Number(refId) !== chatId && !db.referred[chatId]) {
          db.referred[chatId] = Number(refId); addBalance(Number(refId), 10.00); 
          bot.sendMessage(Number(refId), `🎉 **Congratulations!**\nA new user joined using your referral link.\n💰 **10.00 BDT** has been added to your balance!`, { parse_mode: "Markdown" }).catch(()=>{});
      }
      saveDB();
  }
  bot.sendMessage(chatId, `Welcome! 👋 \n\nPlease select an option from the menu below:`, { reply_markup: getReplyMenu(chatId, username) }).catch(()=>{});
});

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  if (!isAdmin(chatId, username)) return bot.sendMessage(chatId, "❌ You don't have admin rights!").catch(()=>{});
  bot.sendMessage(chatId, "⚙️ **Admin Panel:**\n\nHere you can manage iVAS numbers for the bot.", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }).catch(()=>{});
});

bot.on('message', async (msg) => {
  const text = msg.text, chatId = msg.chat.id, username = msg.from.username;
  if (!text || text.startsWith('/')) return;
  if (!db.users.includes(chatId)) { db.users.push(chatId); saveDB(); }

  const triggerWords = ["☎️ Get Number", "📧 Temp Mail", "🔑 2FA", "👤 Profile", "💬 Support", "⚙️ Admin Panel"];
  if ((triggerWords.includes(text) || userStates[chatId]) && !await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);
  if (triggerWords.includes(text)) delete userStates[chatId];

  if (text === "☎️ Get Number") { clearPendingForChat(chatId); bot.sendMessage(chatId, `🛠 Choose the platform you want a number for:`, { reply_markup: platformMenu }).catch(()=>{}); } 
  else if (text === "📧 Temp Mail") {
    // 🟢 Temp Mail Logic with Native Copy Button
    try {
        if (activeTempMails[chatId]) {
            if (!activeTempMails[chatId].otpReceived && activeTempMails[chatId].messageId) {
                bot.deleteMessage(chatId, activeTempMails[chatId].messageId).catch(()=>{});
            }
            if (activeTempMails[chatId].interval) clearInterval(activeTempMails[chatId].interval);
            if (activeTempMails[chatId].timeout) clearTimeout(activeTempMails[chatId].timeout);
        }

        const res = await fetch("https://api.tempmail.lol/v2/inbox/create");
        if (!res.ok) throw new Error("API Server is currently unreachable.");

        const data = await res.json();
        const email = data.address;
        const token = data.token;

        const sentMsg = await bot.sendMessage(chatId, `📧 **Your Temp Mail:**\n\`${email}\`\n\n📩 **SMS Status:** Waiting... ⏳`, { parse_mode: "Markdown" });
        const messageId = sentMsg.message_id;

        activeTempMails[chatId] = { email, token, lastId: null, messageId: messageId, otpReceived: false };

        activeTempMails[chatId].interval = setInterval(async () => {
            try {
                const inboxRes = await fetch(`https://api.tempmail.lol/v2/inbox?token=${token}`);
                const inboxData = await inboxRes.json();
                
                if (inboxData.emails && inboxData.emails.length > 0) {
                    const latest = inboxData.emails[0];
                    const mailId = latest.date + latest.subject; 
                    
                    if (activeTempMails[chatId].lastId !== mailId) {
                        activeTempMails[chatId].lastId = mailId;
                        activeTempMails[chatId].otpReceived = true; 
                        
                        const fullText = `${latest.subject} ${latest.body || ''} ${latest.html || ''}`;
                        const plainText = fullText.replace(/<[^>]+>/g, ' '); 
                        
                        let otpMatch = plainText.match(/\b\d{4,8}\b/);
                        if (!otpMatch) otpMatch = plainText.match(/\b[A-Z0-9]{5,10}\b/i);
                        const otp = otpMatch ? otpMatch[0] : null;

                        const linkMatch = fullText.match(/https?:\/\/[^\s"'<>\\]+/);
                        const link = linkMatch ? linkMatch[0] : null;
                        
                        const platformName = detectPlatform(latest.from, latest.subject, plainText);
                        
                        let cleanMessage = latest.subject.replace(/[\r\n]+/g, ' ').trim();
                        if (cleanMessage.length < 10) {
                            let snippet = (latest.body || plainText).substring(0, 40).replace(/[\r\n]+/g, ' ').trim();
                            cleanMessage += snippet ? " - " + snippet + "..." : "";
                        }
                        
                        let replyText = `📧 **Your Temp Mail:**\n\`${email}\`\n\n📬 **New Email Received!**\n🌐 **Platform:** ${platformName}\n📝 **Message:** ${cleanMessage}`;
                        let markup = { inline_keyboard: [] };
                        
                        if (otp) {
                            replyText += `\n\n🔑 **Code:** \`${otp}\``;
                            markup.inline_keyboard.push([{ text: `📋 Copy Code`, copy_text: { text: otp } }]);
                        } else if (link) {
                            replyText += `\n\n🔗 **Action Required:** This email contains a verification link.`;
                            markup.inline_keyboard.push([{ text: `🌐 Open Link`, url: link }]);
                        } else {
                            replyText += `\n\n⚠️ No specific verification code or link detected.`;
                        }
                        
                        bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: markup.inline_keyboard.length > 0 ? markup : null }).catch(()=>{});
                    }
                }
            } catch (e) {}
        }, 3000);

        activeTempMails[chatId].timeout = setTimeout(() => {
            clearInterval(activeTempMails[chatId].interval);
            if (!activeTempMails[chatId].otpReceived) {
                bot.editMessageText(`📧 **Your Temp Mail:**\n\`${email}\`\n\n⚠️ **Session Expired (15m).**`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(()=>{});
            }
        }, 15 * 60 * 1000);

    } catch (e) {
        bot.sendMessage(chatId, `❌ **Temp mail generation failed.**\n_Reason: ${e.message}_`, { parse_mode: "Markdown" }).catch(()=>{});
    }
  }
  else if (text === "👤 Profile") bot.sendMessage(chatId, `👤 **Profile Info:**\n\n🆔 **User ID:** \`${chatId}\`\n📛 **Name:** ${msg.from.first_name || 'N/A'}\n🎭 **Role:** ${isAdmin(chatId, username) ? (isSuperAdmin(chatId) ? "Super Admin 👑" : "Admin 🛡️") : "User 👤"}\n💰 **Balance:** ${getBalance(chatId).toFixed(2)} BDT\n\n🔗 **Your Referral Link:**\n\`https://t.me/${botInfo.username}?start=${chatId}\`\n_(Invite friends and earn 10 BDT for each new user!)_`, { reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw", callback_data: "withdraw_funds" }]] }, parse_mode: "Markdown" }).catch(()=>{});
  else if (text === "🔑 2FA") { userStates[chatId] = "WAITING_FOR_2FA_KEY"; bot.sendMessage(chatId, "🔐 **Send your secret key:**\n(For example: `RTOX IVWV MK7A 5R7C...`)", { parse_mode: "Markdown" }).catch(()=>{}); }
  else if (userStates[chatId] === "WAITING_FOR_2FA_KEY") {
      try {
          const secret = text.replace(/\s+/g, '').toUpperCase();
          if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 10) throw new Error("Invalid");
          tempAdminData[chatId] = { active2FAKey: secret };
          bot.sendMessage(chatId, `🔐 **2FA Authenticator**\n━━━━━━━━━━\n🔑 **Code:** \`${authenticator.generate(secret)}\`\n🕒 **Refreshes in:** 30s\n━━━━━━━━━━\n_(Simply copy the code above and use it.)_`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh Code", callback_data: "refresh_2fa" }]] } }).catch(()=>{});
      } catch (err) { bot.sendMessage(chatId, "❌ **Invalid Secret Key!**\nPlease make sure you provided a valid format.", { parse_mode: "Markdown" }).catch(()=>{}); }
      delete userStates[chatId]; 
  }
  else if (text === "💬 Support") bot.sendMessage(chatId, "💬 **Support:**\nContact our admin for any assistance.\n(Contact: @Excellentzqlt)", { parse_mode: "Markdown" }).catch(()=>{});
  else if (text === "⚙️ Admin Panel" && isAdmin(chatId, username)) bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }).catch(()=>{});
  else if (userStates[chatId] === "WAITING_FOR_LIMIT" && isAdmin(chatId, username)) {
    const limit = parseInt(text);
    if (isNaN(limit) || limit < 1 || limit > 20) bot.sendMessage(chatId, "❌ Please enter a valid number between 1 and 20.").catch(()=>{});
    else { db.settings.maxNumbers = limit; saveDB(); bot.sendMessage(chatId, `✅ Successfully updated!\nUsers will now get **${limit} numbers** at a time.`).catch(()=>{}); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) }).catch(()=>{}); delete userStates[chatId]; }
  }
  else if (userStates[chatId] === "WAITING_FOR_IVAS_SESSION" && isAdmin(chatId, username)) { 
    tempAdminData[chatId] = { newSession: text.replace(/\s+/g, '') }; 
    userStates[chatId] = "WAITING_FOR_XSRF_TOKEN"; 
    bot.sendMessage(chatId, "✅ **ivas_sms_session** received.\n\nNow, please send the new **XSRF-TOKEN** value:\n_(Type 'skip' if you only want to update the session)_", { parse_mode: "Markdown" }).catch(()=>{}); 
  }
  else if (userStates[chatId] === "WAITING_FOR_XSRF_TOKEN" && isAdmin(chatId, username)) { 
    let xsrf = "";
    if (text.trim().toLowerCase() !== 'skip') {
      xsrf = text.replace(/\s+/g, '');
    }
    const session = tempAdminData[chatId].newSession; 
    
    db.cookies["XSRF-TOKEN"] = xsrf;
    db.cookies["ivas_sms_session"] = session;
    saveDB();
    
    iva.setCookies(xsrf, session); // Push to iva.js memory
    cachedToken = null; 
    
    bot.sendMessage(chatId, "✅ **Cookies have been successfully updated directly to IVA Engine!**").catch(()=>{}); 
    bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) }).catch(()=>{}); 
    delete userStates[chatId]; delete tempAdminData[chatId]; 
  }
  else if (userStates[chatId] === "WAITING_FOR_BROADCAST" && isAdmin(chatId, username)) {
    bot.sendMessage(chatId, `⏳ Broadcasting message...`).catch(()=>{}); let successCount = 0;
    for (let uId of db.users) { try { await bot.sendMessage(uId, `📢 **Admin Broadcast:**\n\n${text}`, { parse_mode: "Markdown" }); successCount++; } catch(e) {} }
    bot.sendMessage(chatId, `✅ **Broadcast Complete!**\nSuccessfully sent to ${successCount} users.`).catch(()=>{}); delete userStates[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_BKASH") {
    if (/^(01[3-9]\d{8})$/.test(text)) {
      const currentBalance = getBalance(chatId);
      if (currentBalance < 50) { bot.sendMessage(chatId, `⚠️ Insufficient balance.`).catch(()=>{}); delete userStates[chatId]; return; }
      bot.sendMessage(ADMIN_ID, `💸 **New Withdraw Request!**\n\n👤 **User ID:** \`${chatId}\`\n📞 **bKash/Nagad:** \`${text}\`\n💰 **Amount:** ${currentBalance.toFixed(2)} BDT`, { parse_mode: "Markdown" }).catch(()=>{});
      bot.sendMessage(chatId, `✅ Your withdrawal request has been sent!`).catch(()=>{}); db.balances[chatId] = 0; saveDB(); delete userStates[chatId]; 
    } else bot.sendMessage(chatId, "❌ Invalid number!").catch(()=>{});
  }
  else if (userStates[chatId] === "WAITING_FOR_ADMIN_USERNAME" && isSuperAdmin(chatId)) {
    let newAdmin = text.trim().toLowerCase(); if(!newAdmin.startsWith("@")) newAdmin = "@" + newAdmin;
    if(!db.adminUsernames.includes(newAdmin)) { db.adminUsernames.push(newAdmin); saveDB(); bot.sendMessage(chatId, `✅ **${newAdmin}** has been made an admin!`).catch(()=>{}); }
    else bot.sendMessage(chatId, `⚠️ Already an admin!`).catch(()=>{});
    bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }).catch(()=>{}); delete userStates[chatId];
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id, messageId = query.message.message_id, data = query.data, username = query.from.username;

  if (data === "check_join") {
    if (await isUserMember(query.from.id)) { bot.deleteMessage(chatId, messageId).catch(()=>{}); bot.sendMessage(chatId, `Welcome! 👋`, { reply_markup: getReplyMenu(chatId, username) }).catch(()=>{}); return bot.answerCallbackQuery(query.id, { text: "✅ Thank you for joining!" }); }
    else return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined yet!", show_alert: true });
  }
  if (!await isUserMember(query.from.id)) { bot.answerCallbackQuery(query.id, { text: "❌ Join group first!", show_alert: true }); return sendJoinPrompt(chatId); }
  
  // 🟢 যুক্ত করা হলো 'delnumrng_' পারমিশন চেকে
  const adminActs = ["admin_", "togglerng_", "refresh_", "deladmin_", "addnum_", "placeholder_stex", "placeholder_mk", "delnumrng_"];
  if (adminActs.some(a => data.startsWith(a)) && !isAdmin(chatId, username) && data !== "refresh_2fa") return bot.answerCallbackQuery(query.id, {text: "❌ Permission Denied!", show_alert: true});

  if (data === "close_menu") { bot.deleteMessage(chatId, messageId).catch(()=>{}); return bot.answerCallbackQuery(query.id); }
  else if (data === "admin_update_cookies") { userStates[chatId] = "WAITING_FOR_IVAS_SESSION"; bot.sendMessage(chatId, "🍪 **Update iVAS Cookies:**\n\nPlease send the new **ivas_sms_session** value:"); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_set_limit") { userStates[chatId] = "WAITING_FOR_LIMIT"; bot.sendMessage(chatId, `🔢 **Number Limit Setup:**\n\nSend new limit (e.g., 2, 5, 10):`); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_broadcast") { userStates[chatId] = "WAITING_FOR_BROADCAST"; bot.sendMessage(chatId, "📢 **Broadcast Mode:**\n\nType the message you want to send to all users."); bot.answerCallbackQuery(query.id); }
  else if (data === "withdraw_funds") { bot.answerCallbackQuery(query.id); bot.deleteMessage(chatId, messageId).catch(()=>{}); bot.sendMessage(chatId, "💸 **Withdrawal Request**\n\nEnter your 11-digit bKash or Nagad number:"); userStates[chatId] = "WAITING_FOR_BKASH"; }
  
  // 🟢 Remove Number Logic Start
  else if (data === "admin_manage_numbers") {
    bot.editMessageText("🛠 **Please select the platform for managing numbers:**", { chat_id: chatId, message_id: messageId, reply_markup: adminPlatformMenu }).catch(()=>{});
    bot.answerCallbackQuery(query.id);
  }
  else if (data === "admin_remove_number_menu") {
    const activeRanges = Object.keys(db.availableNumbers).filter(k => db.availableNumbers[k].length > 0);
    if (activeRanges.length === 0) return bot.answerCallbackQuery(query.id, { text: "📭 No active numbers to remove.", show_alert: true });
    
    let btns = [];
    activeRanges.forEach(r => {
        const info = getCountryInfo(r);
        btns.push([{ text: `🗑️ Remove ${info.flag} ${info.cleanName} (${db.availableNumbers[r].length})`, callback_data: `delnumrng_${r}` }]);
    });
    btns.push([{ text: "🗑️ Remove All Numbers", callback_data: "delnumrng_ALL" }]);
    btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]);
    
    bot.editMessageText("🗑️ **Select a range to remove:**\n_(This will delete the available numbers from the bot)_", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }).catch(()=>{});
    bot.answerCallbackQuery(query.id);
  }
  else if (data.startsWith("delnumrng_")) {
    const target = data.replace("delnumrng_", "");
    if (target === "ALL") {
        db.availableNumbers = {}; saveDB();
        bot.answerCallbackQuery(query.id, { text: "✅ All numbers removed successfully!", show_alert: true });
    } else {
        delete db.availableNumbers[target]; saveDB();
        bot.answerCallbackQuery(query.id, { text: `✅ ${target} numbers removed successfully!` });
    }
    
    const activeRanges = Object.keys(db.availableNumbers).filter(k => db.availableNumbers[k].length > 0);
    if (activeRanges.length === 0) {
        bot.editMessageText("🛠 **Please select the platform for managing numbers:**", { chat_id: chatId, message_id: messageId, reply_markup: adminPlatformMenu }).catch(()=>{});
        return;
    }
    let btns = [];
    activeRanges.forEach(r => {
        const info = getCountryInfo(r);
        btns.push([{ text: `🗑️ Remove ${info.flag} ${info.cleanName} (${db.availableNumbers[r].length})`, callback_data: `delnumrng_${r}` }]);
    });
    btns.push([{ text: "🗑️ Remove All Numbers", callback_data: "delnumrng_ALL" }]);
    btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]);
    bot.editMessageText("🗑️ **Select a range to remove:**\n_(This will delete the available numbers from the bot)_", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }).catch(()=>{});
  }
  // 🟢 Remove Number Logic End

  else if (data === "menu_country_fb") {
    clearPendingForChat(chatId); const ranges = Object.keys(db.availableNumbers).filter(k => db.availableNumbers[k].length > 0);
    if (ranges.length === 0) { bot.answerCallbackQuery(query.id); return bot.editMessageText(`⚠️ Currently, there are no numbers in stock.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "close_menu"
