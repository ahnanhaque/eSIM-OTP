const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const iva = require("./iva"); 

// ==============================================================================
// =================        1. CONFIGURATION & SETUP         ====================
// ==============================================================================

// ⚠️ YOUR BOT CONFIGURATION HERE
const botToken = "8529122267:AAEjUc_8-EcNeHnwP1YPT6FX8wB51k35qKg"; 
const ADMIN_ID = 8278612952; 
const GROUP_CHAT_ID = -1003852968469; 
const GROUP_INVITE_LINK = "https://t.me/+x_1_25vVZJswNWM1"; 

// 🟢 NEW: MongoDB URL এবং iVAS Login Details এখানে বসান!
const MONGODB_URI = "mongodb+srv://ahnanhaque_db_user:<db_password>@cluster0.ygxl28d.mongodb.net/?appName=Cluster0"; 
const IVAS_EMAIL = "ahnanhaquemahi@gmail.com";
const IVAS_PASSWORD = "@ahnan5566";

const PORT = 3000;
const app = express();
app.use(express.json());

const bot = new TelegramBot(botToken, { polling: true });
bot.on("polling_error", (msg) => console.log("\n[Telegram Polling Error]", msg.message));
bot.setMyCommands([{ command: 'start', description: 'Restart the bot' }, { command: 'admin', description: 'Open admin panel' }]);

let botInfo = {};
bot.getMe().then(info => botInfo = info).catch(console.error);

// ==============================================================================
// =================   2. DATABASE & BOT HELPERS (MongoDB)   ====================
// ==============================================================================

const dbSchema = new mongoose.Schema({ balances: Object, lastAssigned: Object, adminUsernames: Array, users: Array, referred: Object, settings: Object, availableNumbers: Object, cookies: Object }, { strict: false });
const BotDB = mongoose.model("BotData", dbSchema);

let db = { balances: {}, lastAssigned: {}, adminUsernames: [], users: [], referred: {}, settings: { maxNumbers: 4 }, availableNumbers: {}, cookies: { "XSRF-TOKEN": "", "ivas_sms_session": "" } };

// ডাটাবেস সেভ ফাংশন (এখন এটি সরাসরি ক্লাউডে সেভ করবে)
function saveDB() {
  BotDB.updateOne({}, db, { upsert: true }).catch(err => console.error("DB Save Error:", err));
}

function getBalance(chatId) { return db.balances[chatId] || 0; }
function addBalance(chatId, amount) { if (!db.balances[chatId]) db.balances[chatId] = 0; db.balances[chatId] += amount; saveDB(); }
function isSuperAdmin(chatId) { return chatId === ADMIN_ID; }
function isAdmin(chatId, username) {
  if (isSuperAdmin(chatId)) return true;
  let un = username ? "@" + username.replace('@', '').toLowerCase() : null;
  return un && db.adminUsernames.includes(un);
}

async function isUserMember(userId) {
  if (isSuperAdmin(userId)) return true; 
  try { const member = await bot.getChatMember(GROUP_CHAT_ID, userId); return ['creator', 'administrator', 'member', 'restricted'].includes(member.status); } catch (err) { return false; }
}

function sendJoinPrompt(chatId) {
  const joinMenu = { inline_keyboard: [[{ text: "📢 Join Group", url: GROUP_INVITE_LINK }], [{ text: "🔄 Check Again", callback_data: "check_join" }]] };
  bot.sendMessage(chatId, `⚠️ **Access Denied!**\n\nTo use this bot, you must first join our official group.\n\nAfter joining, click **Check Again**.`, { reply_markup: joinMenu, parse_mode: "Markdown" });
}

function sendStockAlert(rangeName, count) {
  if (count <= 0) return;
  const info = getCountryInfo(rangeName);
  bot.sendMessage(GROUP_CHAT_ID, `🚀 **NEW STOCK ALERT** 🚀\n\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n📦 **Available:** ${count} Numbers\n🔵 **Service:** FACEBOOK OTP\n\n☎️ [Order Now - Click Here](https://t.me/${botInfo.username || "eSIM_OTP_Bot"})`, { parse_mode: "Markdown", disable_web_page_preview: true }).catch(()=>{});
}

let pendingRequests = {}, lastProcessedOTPTime = {}, inUseNumbers = {}, userStates = {}, tempAdminData = {}, cachedToken = null;

// Keep Session Active + Auto Login Trigger
setInterval(async () => {
  try {
    const token = await iva.fetchToken();
    if (token) { cachedToken = token; console.log(`[Keep-Alive] Session active.`); }
    else {
      console.log(`[Keep-Alive] Session Expired! Triggering Auto-Login...`);
      const loggedIn = await iva.autoLogin(IVAS_EMAIL, IVAS_PASSWORD);
      if (loggedIn) {
        db.cookies = iva.getCookies();
        saveDB();
        cachedToken = await iva.fetchToken();
      }
    }
  } catch (error) {}
}, 3 * 60 * 1000); 

// ==============================================================================
// =================   3. BOT DESIGN & COMPREHENSIVE COUNTRY DATA ================
// ==============================================================================
const countryData = { "TUNISIA": { flag: "🇹🇳" }, "ETHIOPIA": { flag: "🇪🇹" }, "CENTRAL AFRICA": { flag: "🇨🇫" }, "MONGOLIA": { flag: "🇲🇳" }, "MYANMAR": { flag: "🇲🇲" }, "CAMEROON": { flag: "🇨🇲" }, "MALI": { flag: "🇲🇱" }, "PERU": { flag: "🇵🇪" }, "EGYPT": { flag: "🇪🇬" }, "GUINEA": { flag: "🇬🇳" }, "IVORY COAST": { flag: "🇨🇮" }, "COTE D IVOIRE": { flag: "🇨🇮" }, "SENEGAL": { flag: "🇸🇳" }, "NIGERIA": { flag: "🇳🇬" }, "GHANA": { flag: "🇬🇭" }, "KENYA": { flag: "🇰🇪" }, "SOUTH AFRICA": { flag: "🇿🇦" }, "MOROCCO": { flag: "🇲🇦" }, "BRAZIL": { flag: "🇧🇷" }, "MEXICO": { flag: "🇲🇽" }, "INDIA": { flag: "🇮🇳" }, "BANGLADESH": { flag: "🇧🇩" }, "PAKISTAN": { flag: "🇵🇰" }, "PHILIPPINES": { flag: "🇵🇭" }, "INDONESIA": { flag: "🇮🇩" }, "VIETNAM": { flag: "🇻🇳" }, "THAILAND": { flag: "🇹🇭" }, "USA": { flag: "🇺🇸" }, "UNITED STATES": { flag: "🇺🇸" }, "UK": { flag: "🇬🇧" }, "UNITED KINGDOM": { flag: "🇬🇧" }, "FRANCE": { flag: "🇫🇷" }, "GERMANY": { flag: "🇩🇪" }, "ITALY": { flag: "🇮🇹" }, "SPAIN": { flag: "🇪🇸" }, "COLOMBIA": { flag: "🇨🇴" }, "ARGENTINA": { flag: "🇦🇷" }, "TURKEY": { flag: "🇹🇷" }, "RUSSIA": { flag: "🇷🇺" }, "UKRAINE": { flag: "🇺🇦" }, "KAZAKHSTAN": { flag: "🇰🇿" }, "MACAU": { flag: "🇲🇴" }, "HONG KONG": { flag: "🇭🇰" }, "MALAYSIA": { flag: "🇲🇾" }, "CAMBODIA": { flag: "🇰🇭" }, "LAOS": { flag: "🇱🇦" }, "SRI LANKA": { flag: "🇱🇰" }, "NEPAL": { flag: "🇳🇵" }, "ALGERIA": { flag: "🇩🇿" }, "MADAGASCAR": { flag: "🇲🇬" }, "ROMANIA": { flag: "🇷🇴" }, "POLAND": { flag: "🇵🇱" }, "PORTUGAL": { flag: "🇵🇹" }, "NETHERLANDS": { flag: "🇳🇱" }, "SWEDEN": { flag: "🇸🇪" }, "UZBEKISTAN": { flag: "🇺🇿" }, "KYRGYZSTAN": { flag: "🇰🇬" }, "SOUTH KOREA": { flag: "🇰🇷" }, "JAPAN": { flag: "🇯🇵" }, "MACEDONIA": { flag: "🇲🇰" }, "ZAMBIA": { flag: "🇿🇲" }, "ZIMBABWE": { flag: "🇿🇼" }, "CHILE": { flag: "🇨🇱" }, "VENEZUELA": { flag: "🇻🇪" }, "BOLIVIA": { flag: "🇧🇴" }, "PARAGUAY": { flag: "🇵🇾" }, "ECUADOR": { flag: "🇪🇨" }, "ANGOLA": { flag: "🇦🇴" }, "UGANDA": { flag: "🇺🇬" }, "TANZANIA": { flag: "🇹🇿" }, "RWANDA": { flag: "🇷🇼" }, "SAUDI ARABIA": { flag: "🇸🇦" }, "UAE": { flag: "🇦🇪" }, "IRAQ": { flag: "🇮🇶" }, "IRAN": { flag: "🇮🇷" }, "TAIWAN": { flag: "🇹🇼" }, "SINGAPORE": { flag: "🇸🇬" }, "AUSTRALIA": { flag: "🇦🇺" }, "CANADA": { flag: "🇨🇦" }, "CONGO": { flag: "🇨🇩" }, "MOLDOVA": { flag: "🇲🇩" }, "SERBIA": { flag: "🇷🇸" }, "CROATIA": { flag: "🇭🇷" }, "BULGARIA": { flag: "🇧🇬" }, "LITHUANIA": { flag: "🇱🇹" }, "LATVIA": { flag: "🇱🇻" }, "ESTONIA": { flag: "🇪🇪" }, "FINLAND": { flag: "🇫🇮" }, "NORWAY": { flag: "🇳🇴" }, "DENMARK": { flag: "🇩🇰" }, "TAJIKISTAN": { flag: "🇹🇯" }, "BELARUS": { flag: "🇧🇾" }, "GEORGIA": { flag: "🇬🇪" }, "ARMENIA": { flag: "🇬🇪" }, "AFGHANISTAN": { flag: "🇦🇫" }, "SYRIA": { flag: "🇸🇾" }, "YEMEN": { flag: "🇾🇪" }, "OMAN": { flag: "🇴🇲" } };

function getCountryInfo(countryName) {
  if (!countryName) return { flag: "🌍", cleanName: "Unknown" };
  let flag = "🌍", cleanName = countryName.replace(/\s*[vV]?\d+.*$/, '').trim();
  for (const key in countryData) if (countryName.toUpperCase().includes(key)) { flag = countryData[key].flag; cleanName = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '); break; }
  if (flag === "🌍") cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { flag, cleanName };
}

function maskNumber(numStr) { return (!numStr || numStr.length < 6) ? numStr : `${numStr.slice(0, 4)}****${numStr.slice(-4)}`; }

function buildAssignedMessageText(country, numsList, statuses) {
  const info = getCountryInfo(country); let text = "";
  numsList.forEach((num, i) => { text += `☁️ **eSIM OTP** ☁️\n🌍 Country: ${info.flag} ${info.cleanName.toUpperCase()}\n📞 Number: \`${num}\`\n📩 SMS Status: ${statuses[num]}\n`; if (i < numsList.length - 1) text += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`; });
  return text;
}

function clearPendingForChat(chatId) { for (let num in pendingRequests) if (pendingRequests[num].chatId === chatId) { delete inUseNumbers[num]; delete pendingRequests[num]; } }

function getReplyMenu(chatId, username) {
  let keyboard = [[{ text: "☎️ Get Number" }], [{ text: "💰 Balance" }, { text: "👤 Profile" }]];
  if (isAdmin(chatId, username)) keyboard.push([{ text: "💬 Support" }, { text: "⚙️ Admin Panel" }]); else keyboard.push([{ text: "💬 Support" }]);
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

const platformMenu = { inline_keyboard: [[{ text: "📘 Facebook", callback_data: "menu_country_fb" }], [{ text: "❌ Close Menu", callback_data: "close_menu" }]] };

function getAdminMenu(chatId) {
  let menu = [ [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" }, { text: "🔢 Set Number Limit", callback_data: "admin_set_limit" }], [{ text: "⚙️ Manage Ranges", callback_data: "admin_manage_ranges" }, { text: "➕ Add Number", callback_data: "admin_add_number" }], [{ text: "🍪 Auto-Login (Force)", callback_data: "admin_force_login" }, { text: "🍪 Update Cookies (Manual)", callback_data: "admin_update_cookies" }] ];
  if (isSuperAdmin(chatId)) menu.push([{ text: "👑 Manage Admins", callback_data: "admin_manage_admins" }, { text: "❌ Close Menu", callback_data: "close_menu" }]); else menu.push([{ text: "❌ Close Menu", callback_data: "close_menu" }]);
  return { inline_keyboard: menu };
}

function renderManageRangesMenu(chatId, messageId) {
  const rangesArray = tempAdminData[chatId] || []; let rangeButtons = [];
  rangesArray.forEach((r, index) => { let isAdded = db.availableNumbers[r.name] && db.availableNumbers[r.name].length > 0; rangeButtons.push([{ text: `${isAdded ? "✅" : "❌"} ${getCountryInfo(r.name).flag} ${r.name} (${r.nums.length})`, callback_data: `togglerng_${index}` }]); });
  rangeButtons.push([{ text: "📥 Add All", callback_data: "togglerng_addall" }, { text: "🗑️ Remove All", callback_data: "togglerng_delall" }]);
  rangeButtons.push([{ text: "🔄 Refresh List", callback_data: "refresh_manage_ranges" }, { text: "⬅️ Back to Admin", callback_data: "admin_panel" }]);
  bot.editMessageText("⚙️ **Manage Ranges:**\n\nClick a range to toggle (✅ Added / ❌ Removed):", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rangeButtons }, parse_mode: "Markdown" }).catch(()=>{});
}

// ==============================================================================
// =================   4. TELEGRAM BOT HANDLERS                      ====================
// ==============================================================================

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id, username = msg.from.username;
  if (!await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);
  if (!db.users.includes(chatId)) {
      db.users.push(chatId); const refId = match[1];
      if (refId && Number(refId) !== chatId && !db.referred[chatId]) { db.referred[chatId] = Number(refId); addBalance(Number(refId), 10.00); bot.sendMessage(Number(refId), `🎉 **Congratulations!**\nA new user joined using your referral link.\n💰 **10.00 BDT** has been added to your balance!`, { parse_mode: "Markdown" }).catch(()=>{}); }
      saveDB();
  }
  bot.sendMessage(chatId, `Welcome! 👋 \n\nPlease select an option from the menu below:`, { reply_markup: getReplyMenu(chatId, username) });
});

bot.onText(/\/admin/, async (msg) => {
  if (!isAdmin(msg.chat.id, msg.from.username)) return bot.sendMessage(msg.chat.id, "❌ You don't have admin rights!");
  bot.sendMessage(msg.chat.id, "⚙️ **Admin Panel:**\n\nHere you can manage iVAS numbers for the bot.", { reply_markup: getAdminMenu(msg.chat.id), parse_mode: "Markdown" });
});

bot.on('message', async (msg) => {
  const text = msg.text, chatId = msg.chat.id, username = msg.from.username;
  if (!text || text.startsWith('/')) return;
  if (!db.users.includes(chatId)) { db.users.push(chatId); saveDB(); }

  const triggerWords = ["☎️ Get Number", "💰 Balance", "👤 Profile", "💬 Support", "⚙️ Admin Panel"];
  if ((triggerWords.includes(text) || userStates[chatId]) && !await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);

  if (text === "☎️ Get Number") { clearPendingForChat(chatId); bot.sendMessage(chatId, `🛠 Choose the platform you want a number for:`, { reply_markup: platformMenu }); } 
  else if (text === "💰 Balance") bot.sendMessage(chatId, `💰 **Your Current Balance:** ${getBalance(chatId).toFixed(2)} BDT\n(Minimum withdrawal 50 BDT)`, { reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw", callback_data: "withdraw_funds" }]] }, parse_mode: "Markdown" });
  else if (text === "👤 Profile") bot.sendMessage(chatId, `👤 **Profile Info:**\n\n🆔 **User ID:** \`${chatId}\`\n📛 **Name:** ${msg.from.first_name || 'N/A'}\n🎭 **Role:** ${isAdmin(chatId, username) ? (isSuperAdmin(chatId) ? "Super Admin 👑" : "Admin 🛡️") : "User 👤"}\n💰 **Balance:** ${getBalance(chatId).toFixed(2)} BDT\n\n🔗 **Your Referral Link:**\n\`https://t.me/${botInfo.username}?start=${chatId}\`\n_(Invite friends and earn 10 BDT for each new user!)_`, { parse_mode: "Markdown" });
  else if (text === "💬 Support") bot.sendMessage(chatId, "💬 **Support:**\nContact our admin for any assistance.\n(Contact: @Excellentzqlt)", { parse_mode: "Markdown" });
  else if (text === "⚙️ Admin Panel" && isAdmin(chatId, username)) bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" });
  else if (userStates[chatId] === "WAITING_FOR_LIMIT" && isAdmin(chatId, username)) {
    const limit = parseInt(text);
    if (isNaN(limit) || limit < 1 || limit > 20) bot.sendMessage(chatId, "❌ Please enter a valid number between 1 and 20.");
    else { db.settings.maxNumbers = limit; saveDB(); bot.sendMessage(chatId, `✅ Successfully updated!\nUsers will now get **${limit} numbers** at a time.`); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) }); delete userStates[chatId]; }
  }
  else if (userStates[chatId] === "WAITING_FOR_COOKIES" && isAdmin(chatId, username)) {
    const cookieStr = text.trim(), xsrfMatch = cookieStr.match(/XSRF-TOKEN=([^;]+)/), sessionMatch = cookieStr.match(/ivas_sms_session=([^;]+)/);
    if (!sessionMatch) { bot.sendMessage(chatId, "❌ **ivas_sms_session** cookie string এ পাওয়া যায়নি! আবার পাঠান।", { parse_mode: "Markdown" }); return; }
    db.cookies["XSRF-TOKEN"] = xsrfMatch ? xsrfMatch[1].trim() : ""; db.cookies["ivas_sms_session"] = sessionMatch[1].trim();
    saveDB(); iva.setCookies(db.cookies["XSRF-TOKEN"], db.cookies["ivas_sms_session"]); cachedToken = null;
    bot.sendMessage(chatId, "✅ **Cookies have been successfully updated!**"); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) });
    delete userStates[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_ADD_NUMBERS" && isAdmin(chatId, username)) {
    const country = tempAdminData[chatId]?.addNumberCountry; if (!country) { delete userStates[chatId]; return; }
    const numbers = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (!db.availableNumbers[country]) db.availableNumbers[country] = [];
    let added = 0; numbers.forEach(num => { if (!db.availableNumbers[country].includes(num)) { db.availableNumbers[country].push(num); added++; } }); saveDB();
    bot.sendMessage(chatId, `✅ **${added}টি নম্বর যোগ হয়েছে** ${getCountryInfo(country).flag} ${country} তে!`, { parse_mode: "Markdown" }); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) });
    delete userStates[chatId]; delete tempAdminData[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_BROADCAST" && isAdmin(chatId, username)) {
    bot.sendMessage(chatId, `⏳ Broadcasting message...`); let successCount = 0;
    for (let uId of db.users) { try { await bot.sendMessage(uId, `📢 **Admin Broadcast:**\n\n${text}`, { parse_mode: "Markdown" }); successCount++; } catch(e) {} }
    bot.sendMessage(chatId, `✅ **Broadcast Complete!**\nSuccessfully sent to ${successCount} users.`); delete userStates[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_BKASH") {
    if (/^(01[3-9]\d{8})$/.test(text)) {
      const currentBalance = getBalance(chatId); if (currentBalance < 50) { bot.sendMessage(chatId, `⚠️ Insufficient balance.`); delete userStates[chatId]; return; }
      bot.sendMessage(ADMIN_ID, `💸 **New Withdraw Request!**\n\n👤 **User ID:** \`${chatId}\`\n📞 **bKash/Nagad:** \`${text}\`\n💰 **Amount:** ${currentBalance.toFixed(2)} BDT`, { parse_mode: "Markdown" });
      bot.sendMessage(chatId, `✅ Your withdrawal request has been sent!`); db.balances[chatId] = 0; saveDB(); delete userStates[chatId]; 
    } else bot.sendMessage(chatId, "❌ Invalid number!");
  }
  else if (userStates[chatId] === "WAITING_FOR_ADMIN_USERNAME" && isSuperAdmin(chatId)) {
    let newAdmin = text.trim().toLowerCase(); if(!newAdmin.startsWith("@")) newAdmin = "@" + newAdmin;
    if(!db.adminUsernames.includes(newAdmin)) { db.adminUsernames.push(newAdmin); saveDB(); bot.sendMessage(chatId, `✅ **${newAdmin}** has been made an admin!`); }
    else bot.sendMessage(chatId, `⚠️ Already an admin!`); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }); delete userStates[chatId];
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id, messageId = query.message.message_id, data = query.data, username = query.from.username;

  if (data === "check_join") {
    if (await isUserMember(query.from.id)) { bot.deleteMessage(chatId, messageId).catch(()=>{}); bot.sendMessage(chatId, `Welcome! 👋`, { reply_markup: getReplyMenu(chatId, username) }); return bot.answerCallbackQuery(query.id, { text: "✅ Thank you for joining!" }); }
    else return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined yet!", show_alert: true });
  }
  if (!await isUserMember(query.from.id)) { bot.answerCallbackQuery(query.id, { text: "❌ Join group first!", show_alert: true }); return sendJoinPrompt(chatId); }
  if ((data.startsWith("admin_") || data.startsWith("togglerng_") || data.startsWith("refresh_") || data.startsWith("deladmin_") || data.startsWith("addnum_")) && !isAdmin(chatId, username)) return bot.answerCallbackQuery(query.id, {text: "❌ Permission Denied!", show_alert: true});

  if (data === "close_menu") { bot.deleteMessage(chatId, messageId).catch(()=>{}); return bot.answerCallbackQuery(query.id); }
  else if (data === "admin_update_cookies") { userStates[chatId] = "WAITING_FOR_COOKIES"; bot.sendMessage(chatId, "🍪 **Update iVAS Cookies (Manual):**\n\nপুরো cookie string পাঠান:", { parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_force_login") { 
    bot.editMessageText("⏳ **Logging in to iVAS automatically...**", { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(()=>{});
    const success = await iva.autoLogin(IVAS_EMAIL, IVAS_PASSWORD);
    if (success) { db.cookies = iva.getCookies(); saveDB(); cachedToken = null; bot.editMessageText("✅ **Auto-Login Successful! Fresh cookies acquired.**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }).catch(()=>{}); }
    else { bot.editMessageText("❌ **Auto-Login Failed! Please check your Email/Password in server.js.**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }).catch(()=>{}); }
    bot.answerCallbackQuery(query.id);
  }
  else if (data === "admin_set_limit") { userStates[chatId] = "WAITING_FOR_LIMIT"; bot.sendMessage(chatId, `🔢 **Number Limit Setup:**\n\nSend new limit (e.g., 2, 5, 10):`); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_broadcast") { userStates[chatId] = "WAITING_FOR_BROADCAST"; bot.sendMessage(chatId, "📢 **Broadcast Mode:**\n\nType the message you want to send to all users."); bot.answerCallbackQuery(query.id); }
  else if (data === "withdraw_funds") { bot.answerCallbackQuery(query.id); bot.deleteMessage(chatId, messageId).catch(()=>{}); bot.sendMessage(chatId, "💸 **Withdrawal Request**\n\nEnter your 11-digit bKash or Nagad number:"); userStates[chatId] = "WAITING_FOR_BKASH"; }
  else if (data === "menu_country_fb") {
    clearPendingForChat(chatId); const ranges = Object.keys(db.availableNumbers).filter(k => db.availableNumbers[k].length > 0);
    if (ranges.length === 0) { bot.answerCallbackQuery(query.id); return bot.editMessageText(`⚠️ Currently, there are no numbers in stock.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "close_menu" }]] } }); }
    let baseCountryCount = {}, currentV = {}, countryButtons = [];
    ranges.forEach(r => { let i = getCountryInfo(r); baseCountryCount[i.cleanName] = (baseCountryCount[i.cleanName] || 0) + 1; });
    ranges.forEach(range => { let info = getCountryInfo(range), displayName = `${info.flag} ${info.cleanName}`; if (baseCountryCount[info.cleanName] > 1) { currentV[info.cleanName] = (currentV[info.cleanName] || 0) + 1; displayName += ` V${currentV[info.cleanName]}`; } displayName += ` | 📦: ${db.availableNumbers[range].length}`; countryButtons.push([{ text: displayName, callback_data: `assign_${range}` }]); });
    countryButtons.push([{ text: "❌ Close Menu", callback_data: "close_menu" }, { text: "⬅️ Back", callback_data: "menu_platform" }]);
    bot.editMessageText(`🌍 Select a country for Facebook:`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: countryButtons } }); bot.answerCallbackQuery(query.id);
  }
  else if (data === "menu_platform") { clearPendingForChat(chatId); bot.editMessageText(`🛠 Choose the platform:`, { chat_id: chatId, message_id: messageId, reply_markup: platformMenu }); bot.answerCallbackQuery(query.id); }
  else if (data.startsWith("assign_")) {
    const selectedCountry = data.replace("assign_next_", "").replace("assign_", ""); clearPendingForChat(chatId);
    const nums = db.availableNumbers[selectedCountry] || [];
    if (nums.length === 0) return bot.answerCallbackQuery(query.id, { text: `⚠️ No more numbers in stock!`, show_alert: true });
    const limit = db.settings.maxNumbers || 4, assignedNums = nums.splice(0, limit); let allStatuses = {};
    assignedNums.forEach(n => { allStatuses[n] = "Waiting... ⏳"; inUseNumbers[n] = true; });
    db.lastAssigned[chatId] = { country: selectedCountry, nums: [...assignedNums], statuses: { ...allStatuses } }; saveDB();
    const actionMenu = { inline_keyboard: [[{ text: "📩 OTP GROUP", url: GROUP_INVITE_LINK }], [{ text: `➡️ Next ${limit} Numbers`, callback_data: `assign_next_${selectedCountry}` }], [{ text: "⬅️ Back", callback_data: "menu_country_fb" }]] };
    bot.editMessageText(buildAssignedMessageText(selectedCountry, assignedNums, allStatuses), { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).then(() => { assignedNums.forEach(num => { pendingRequests[num] = { chatId: chatId, messageId: messageId, country: selectedCountry, batchNums: assignedNums, allStatuses: allStatuses }; }); }).catch(()=>{});
    bot.answerCallbackQuery(query.id);
  }
  else if (data === "admin_panel") { bot.editMessageText("⚙️ **Admin Panel:**", { chat_id: chatId, message_id: messageId, reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_manage_ranges" || data === "refresh_manage_ranges") {
    if (data === "admin_manage_ranges") bot.editMessageText("⏳ Fetching ranges from iVAS...", { chat_id: chatId, message_id: messageId }).catch(()=>{});
    bot.answerCallbackQuery(query.id, { text: "🔄 Refreshing list..." });
    try {
      let token = cachedToken || await iva.fetchToken();
      if (!token) {
         await iva.autoLogin(IVAS_EMAIL, IVAS_PASSWORD); db.cookies = iva.getCookies(); saveDB(); token = await iva.fetchToken();
         if (!token) return bot.editMessageText(`❌ **Session Expired! Auto-Login Failed.**\n\nPlease click **"🍪 Auto-Login (Force)"** or update cookies manually.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" });
      }
      const resData = await iva.getNumbers(token); let grouped = {}; 
      if (resData.aaData) resData.aaData.forEach(row => { const range = row[0]; const num = row[2]; if (!inUseNumbers[num]) { if (!grouped[range]) grouped[range] = []; grouped[range].push(num); } });
      for (const r in db.availableNumbers) if (!grouped[r]) grouped[r] = db.availableNumbers[r];
      tempAdminData[chatId] = Object.keys(grouped).map(r => ({ name: r, nums: grouped[r] }));
      if (tempAdminData[chatId].length === 0) return bot.editMessageText("📭 No ranges found in iVAS.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_panel" }]] } });
      renderManageRangesMenu(chatId, messageId);
    } catch (e) { bot.editMessageText("❌ Failed to fetch numbers! Try again later.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_panel" }]] } }); }
  }
  else if (data.startsWith("togglerng_")) {
    const action = data.replace("togglerng_", ""); if (!tempAdminData[chatId]) return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired! Fetch again.", show_alert: true });
    if (action === "addall") { let totalAdded = 0; tempAdminData[chatId].forEach(r => { if (!db.availableNumbers[r.name]) db.availableNumbers[r.name] = []; r.nums.forEach(num => { if (!db.availableNumbers[r.name].includes(num) && !inUseNumbers[num]) { db.availableNumbers[r.name].push(num); totalAdded++; } }); }); saveDB(); bot.answerCallbackQuery(query.id, { text: `✅ Added all (${totalAdded})!` }); }
    else if (action === "delall") { tempAdminData[chatId].forEach(r => { delete db.availableNumbers[r.name]; }); saveDB(); bot.answerCallbackQuery(query.id, { text: `🗑️ Removed all!` }); }
    else { const idx = parseInt(action), selected = tempAdminData[chatId][idx]; if (db.availableNumbers[selected.name]) { delete db.availableNumbers[selected.name]; saveDB(); bot.answerCallbackQuery(query.id, { text: `❌ Removed ${selected.name}` }); } else { db.availableNumbers[selected.name] = []; let added = 0; selected.nums.forEach(num => { if (!inUseNumbers[num]) { db.availableNumbers[selected.name].push(num); added++; } }); saveDB(); sendStockAlert(selected.name, selected.nums.length); bot.answerCallbackQuery(query.id, { text: `✅ Added ${selected.name} (${added})` }); } }
    renderManageRangesMenu(chatId, messageId);
  }
  else if (data === "admin_add_number") {
    const countries = Object.keys(countryData), countryBtns = [];
    for (let i = 0; i < countries.length; i += 2) { const row = [{ text: `${countryData[countries[i]].flag} ${countries[i]}`, callback_data: `addnum_${countries[i]}` }]; if (countries[i+1]) row.push({ text: `${countryData[countries[i+1]].flag} ${countries[i+1]}`, callback_data: `addnum_${countries[i+1]}` }); countryBtns.push(row); }
    countryBtns.push([{ text: "⬅️ Back to Admin", callback_data: "admin_panel" }]); bot.editMessageText("➕ **Add Numbers:**\n\nCountry select করুন:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: countryBtns }, parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id);
  }
  else if (data.startsWith("addnum_")) { const country = data.replace("addnum_", ""); tempAdminData[chatId] = { addNumberCountry: country }; userStates[chatId] = "WAITING_FOR_ADD_NUMBERS"; const info = getCountryInfo(country); bot.sendMessage(chatId, `➕ **${info.flag} ${country}** তে নম্বর যোগ করুন:\n\nএকটি করে লাইনে নম্বর পাঠান:`, { parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_manage_admins") { if (!isSuperAdmin(chatId)) return; bot.editMessageText("👑 **Admin Management:**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "➕ Add Admin", callback_data: "admin_add_admin" }, { text: "➖ Remove Admin", callback_data: "admin_remove_admin" }], [{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_add_admin") { if (!isSuperAdmin(chatId)) return; userStates[chatId] = "WAITING_FOR_ADMIN_USERNAME"; bot.sendMessage(chatId, "👤 **Enter Telegram Username:**"); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_remove_admin") { if (!isSuperAdmin(chatId)) return; if (db.adminUsernames.length === 0) return bot.answerCallbackQuery(query.id, { text: "📭 No admins found!", show_alert: true }); let btns = db.adminUsernames.map(un => [{ text: `❌ Remove ${un}`, callback_data: `deladmin_${un}` }]); btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_admins" }]); bot.editMessageText("🗑️ **Select admin to remove:**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data.startsWith("deladmin_")) { if (!isSuperAdmin(chatId)) return; let unToRemove = data.replace("deladmin_", ""); db.adminUsernames = db.adminUsernames.filter(u => u !== unToRemove); saveDB(); bot.answerCallbackQuery(query.id, { text: `✅ ${unToRemove} removed!`, show_alert: true }); bot.editMessageText("👑 **Admin Management:**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "➕ Add Admin", callback_data: "admin_add_admin" }, { text: "➖ Remove Admin", callback_data: "admin_remove_admin" }], [{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }); }
  else { bot.answerCallbackQuery(query.id); }
});

// ==============================================================================
// =================      5. SHARED OTP PROCESSOR            ====================
// ==============================================================================

function processFoundOTP(number, time, message, range) {
  const uniqueId = `${number}_${time}`;
  if (lastProcessedOTPTime[uniqueId]) return; 
  lastProcessedOTPTime[uniqueId] = true;      

  let otpMatch = message.match(/\b\d{5,8}\b/), otpCode = otpMatch ? otpMatch[0] : null;
  const maskedNum = maskNumber(number), countryInfo = getCountryInfo(range || "UNKNOWN"), displayOtp = otpCode ? otpCode : "Not Found";

  bot.sendMessage(GROUP_CHAT_ID, `✅ **New OTP Received** ✅\n\n🌍 **Country:** ${countryInfo.flag} ${countryInfo.cleanName}\n📱 **Number:** \`${maskedNum}\`\n💬 **OTP:** \`${displayOtp}\`\n🔵 **Service:** FACEBOOK\n\n💌 **Full SMS:**\n❝ ${message} ❞`, { parse_mode: "Markdown" }).catch(()=>{});

  if (pendingRequests[number]) {
    const reqData = pendingRequests[number]; reqData.allStatuses[number] = `✅ \`${otpCode || message}\``;
    if (db.lastAssigned[reqData.chatId] && db.lastAssigned[reqData.chatId].nums.includes(number)) { db.lastAssigned[reqData.chatId].statuses[number] = reqData.allStatuses[number]; saveDB(); }
    bot.editMessageText(buildAssignedMessageText(reqData.country, reqData.batchNums, reqData.allStatuses), { chat_id: reqData.chatId, message_id: reqData.messageId, reply_markup: { inline_keyboard: [[{ text: "📩 OTP GROUP", url: GROUP_INVITE_LINK }], [{ text: `➡️ Next ${db.settings.maxNumbers || 4} Numbers`, callback_data: `assign_next_${reqData.country}` }], [{ text: "⬅️ Back", callback_data: "menu_country_fb" }]] }, parse_mode: "Markdown" }).catch(()=>{});
    addBalance(reqData.chatId, 0.50); delete pendingRequests[number]; delete inUseNumbers[number]; 
  }
}

// ==============================================================================
// =================      6. FAST OTP CHECKER SYSTEM         ====================
// ==============================================================================

let isFastChecking = false, isHeavyChecking = false;

async function fastPendingOTPCheck() {
  if (isFastChecking) return; const pNums = Object.keys(pendingRequests); if (pNums.length === 0) return; 
  isFastChecking = true;
  try {
    const token = cachedToken || await iva.fetchToken();
    if (token) {
      const today = iva.getToday(), boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";
      await iva.makeRequest("POST", "/portal/sms/received/getsms", [`--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`, `--${boundary}--`].join("\r\n"), `multipart/form-data; boundary=${boundary}`, { "Referer": `${iva.BASE_URL}/portal/sms/received` });
      const rangesToCheck = [...new Set(pNums.map(n => pendingRequests[n].country))];
      for (const range of rangesToCheck) {
        await iva.makeRequest("POST", "/portal/sms/received/getsms/number", new URLSearchParams({ _token: token, start: today, end: today, range }).toString(), "application/x-www-form-urlencoded", { "Referer": `${iva.BASE_URL}/portal/sms/received` });
        await Promise.all(pNums.filter(n => pendingRequests[n].country === range).map(async (number) => {
          const r3 = await iva.makeRequest("POST", "/portal/sms/received/getsms/number/sms", new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range }).toString(), "application/x-www-form-urlencoded", { "Referer": `${iva.BASE_URL}/portal/sms/received` }).catch(() => null);
          if (r3) iva.parseSMSMessages(r3.body, range, number, today).forEach(msg => processFoundOTP(number, msg[0], msg[4], range));
        }));
      }
    }
  } catch (err) {}
  isFastChecking = false;
}

async function checkAllOTP() {
  if (isHeavyChecking) return; isHeavyChecking = true;
  try {
    const token = cachedToken || await iva.fetchToken();
    if (token) { const resData = await iva.getSMS(token); if (resData.aaData) resData.aaData.forEach(row => processFoundOTP(row[2], row[0], row[4], row[1])); }
  } catch (err) {}
  isHeavyChecking = false;
}

// ==============================================================================
// =================    7. WEB SERVER & MONGODB INIT         ====================
// ==============================================================================

app.get('/', (req, res) => res.status(200).send('Bot is running perfectly!'));

// 🟢 MONGODB CONNECT & START SERVER
mongoose.connect(MONGODB_URI).then(async () => {
  console.log("✅ MongoDB Connected!");
  
  const data = await BotDB.findOne();
  if (data) db = { ...db, ...data.toObject() };
  else await BotDB.create(db);

  if (db.cookies && db.cookies["XSRF-TOKEN"]) iva.setCookies(db.cookies["XSRF-TOKEN"], db.cookies["ivas_sms_session"]);

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    setInterval(fastPendingOTPCheck, 2000);
    setInterval(checkAllOTP, 15000); 
  });
}).catch(err => console.log("❌ MongoDB Connection Error:", err));
