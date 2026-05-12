const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const { authenticator } = require("otplib"); 

const botToken = "8529122267:AAEjUc_8-EcNeHnwP1YPT6FX8wB51k35qKg"; 
const ADMIN_ID = 8278612952; 
const GROUP_CHAT_ID = -1003852968469; 
const GROUP_INVITE_LINK = "https://t.me/+x_1_25vVZJswNWM1"; 
const MONGODB_URI = "mongodb+srv://ahnanhaque_db_user:p9WFrr4y95miiOsX@cluster0.ygxl28d.mongodb.net/?appName=Cluster0"; 
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const bot = new TelegramBot(botToken, { polling: true });
bot.on("polling_error", (msg) => console.log("\n[Telegram Error]", msg.message));
bot.setMyCommands([{ command: 'start', description: 'Restart the bot' }, { command: 'admin', description: 'Open admin panel' }]);

let botInfo = {};
bot.getMe().then(info => botInfo = info).catch(console.error);

const dbSchema = new mongoose.Schema({ balances: Object, lastAssigned: Object, adminUsernames: Array, users: Array, referred: Object, settings: Object, availableNumbers: Object, cookies: Object }, { strict: false });
const BotDB = mongoose.model("BotData", dbSchema);

let db = { balances: {}, lastAssigned: {}, adminUsernames: [], users: [], referred: {}, settings: { maxNumbers: 4 }, availableNumbers: {}, cookies: {} };
let isDbLoaded = false, latestRangesFromExtension = {}; 
let pendingRequests = {}, lastProcessedOTPTime = {}, inUseNumbers = {}, userStates = {}, tempAdminData = {}, activeTempMails = {};

function saveDB() { if (!isDbLoaded) return; BotDB.updateOne({}, db, { upsert: true }).catch(err => console.error(err)); }
function getBalance(chatId) { return db.balances[chatId] || 0; }
function addBalance(chatId, amount) { if (!db.balances[chatId]) db.balances[chatId] = 0; db.balances[chatId] += amount; saveDB(); }
function isSuperAdmin(chatId) { return chatId === ADMIN_ID; }
function isAdmin(chatId, username) { if (isSuperAdmin(chatId)) return true; let un = username ? "@" + username.replace('@', '').toLowerCase() : null; return un && db.adminUsernames.includes(un); }
async function isUserMember(userId) { if (isSuperAdmin(userId)) return true; try { const member = await bot.getChatMember(GROUP_CHAT_ID, userId); return ['creator', 'administrator', 'member', 'restricted'].includes(member.status); } catch (e) { return false; } }

function sendJoinPrompt(chatId) {
  bot.sendMessage(chatId, `⚠️ **Access Denied!**\n\nYou must join our official group first to use this bot. Once joined, click the check button below.`, { reply_markup: { inline_keyboard: [[{ text: "📢 Join Group", url: GROUP_INVITE_LINK }], [{ text: "🔄 Check Again", callback_data: "check_join" }]] }, parse_mode: "Markdown" });
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

function getCountryInfo(countryName) {
  if (!countryName) return { flag: "🌍", cleanName: "Unknown" };
  let flag = "🌍", cleanName = countryName.replace(/\s*[vV]?\d+.*$/, '').trim();
  for (const key in countryData) if (countryName.toUpperCase().includes(key)) { flag = countryData[key].flag; cleanName = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '); break; }
  if (flag === "🌍") cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { flag, cleanName };
}

const countryData = { "TUNISIA": { flag: "🇹🇳" }, "ETHIOPIA": { flag: "🇪🇹" }, "CENTRAL AFRICA": { flag: "🇨🇫" }, "MONGOLIA": { flag: "🇲🇳" }, "MYANMAR": { flag: "🇲🇲" }, "CAMEROON": { flag: "🇨🇲" }, "MALI": { flag: "🇲🇱" }, "PERU": { flag: "🇵🇪" }, "EGYPT": { flag: "🇪🇬" }, "GUINEA": { flag: "🇬🇳" }, "IVORY COAST": { flag: "🇨🇮" }, "SENEGAL": { flag: "🇸🇳" }, "NIGERIA": { flag: "🇳🇬" }, "GHANA": { flag: "🇬🇭" }, "KENYA": { flag: "🇰🇪" }, "SOUTH AFRICA": { flag: "🇿🇦" }, "MOROCCO": { flag: "🇲🇦" }, "BRAZIL": { flag: "🇧🇷" }, "MEXICO": { flag: "🇲🇽" }, "INDIA": { flag: "🇮🇳" }, "BANGLADESH": { flag: "🇧🇩" }, "PAKISTAN": { flag: "🇵🇰" }, "PHILIPPINES": { flag: "🇵🇭" }, "INDONESIA": { flag: "🇮🇩" }, "VIETNAM": { flag: "🇻🇳" }, "THAILAND": { flag: "🇹🇭" }, "USA": { flag: "🇺🇸" }, "UK": { flag: "🇬🇧" }, "FRANCE": { flag: "🇫🇷" }, "GERMANY": { flag: "🇩🇪" }, "ITALY": { flag: "🇮🇹" }, "SPAIN": { flag: "🇪🇸" }, "COLOMBIA": { flag: "🇨🇴" }, "ARGENTINA": { flag: "🇦🇷" }, "TURKEY": { flag: "🇹🇷" }, "RUSSIA": { flag: "🇷🇺" }, "UKRAINE": { flag: "🇺🇦" }, "KAZAKHSTAN": { flag: "🇰🇿" }, "MACAU": { flag: "🇲🇴" }, "HONG KONG": { flag: "🇭🇰" }, "MALAYSIA": { flag: "🇲🇾" }, "CAMBODIA": { flag: "🇰🇭" }, "LAOS": { flag: "🇱🇦" }, "SRI LANKA": { flag: "🇱🇰" }, "NEPAL": { flag: "🇳🇵" }, "ALGERIA": { flag: "🇩🇿" }, "MADAGASCAR": { flag: "🇲🇬" }, "ROMANIA": { flag: "🇷🇴" }, "POLAND": { flag: "🇵🇱" }, "PORTUGAL": { flag: "🇵🇹" }, "NETHERLANDS": { flag: "🇳🇱" }, "SWEDEN": { flag: "🇸🇪" }, "UZBEKISTAN": { flag: "🇺🇿" }, "KYRGYZSTAN": { flag: "🇰🇬" }, "SOUTH KOREA": { flag: "🇰🇷" }, "JAPAN": { flag: "🇯🇵" }, "MACEDONIA": { flag: "🇲🇰" }, "ZAMBIA": { flag: "🇿🇲" }, "ZIMBABWE": { flag: "🇿🇼" }, "CHILE": { flag: "🇨🇱" }, "VENEZUELA": { flag: "🇻🇪" }, "BOLIVIA": { flag: "🇧🇴" }, "PARAGUAY": { flag: "🇵🇾" }, "ECUADOR": { flag: "🇪🇨" }, "ANGOLA": { flag: "🇦🇴" }, "UGANDA": { flag: "🇺🇬" }, "TANZANIA": { flag: "🇹🇿" }, "RWANDA": { flag: "🇷🇼" }, "SAUDI ARABIA": { flag: "🇸🇦" }, "UAE": { flag: "🇦🇪" }, "IRAQ": { flag: "🇮🇶" }, "IRAN": { flag: "🇮🇷" }, "TAIWAN": { flag: "🇹🇼" }, "SINGAPORE": { flag: "🇸🇬" }, "AUSTRALIA": { flag: "🇦🇺" }, "CANADA": { flag: "🇨🇦" }, "CONGO": { flag: "🇨🇩" }, "MOLDOVA": { flag: "🇲🇩" }, "SERBIA": { flag: "🇷🇸" }, "CROATIA": { flag: "🇭🇷" }, "BULGARIA": { flag: "🇧🇬" }, "LITHUANIA": { flag: "🇱🇹" }, "LATVIA": { flag: "🇱🇻" }, "ESTONIA": { flag: "🇪🇪" }, "FINLAND": { flag: "🇫🇮" }, "NORWAY": { flag: "🇳🇴" }, "DENMARK": { flag: "🇩🇰" }, "TAJIKISTAN": { flag: "🇹🇯" }, "BELARUS": { flag: "🇧🇾" }, "GEORGIA": { flag: "🇬🇪" }, "ARMENIA": { flag: "🇬🇪" }, "AFGHANISTAN": { flag: "🇦🇫" }, "SYRIA": { flag: "🇸🇾" }, "YEMEN": { flag: "🇾🇪" }, "OMAN": { flag: "🇴🇲" } };

function maskNumber(numStr) { return (!numStr || numStr.length < 6) ? numStr : `${numStr.slice(0, 4)}****${numStr.slice(-4)}`; }

function clearPendingForChat(chatId) { for (let num in pendingRequests) if (pendingRequests[num].chatId === chatId) { delete inUseNumbers[num]; delete pendingRequests[num]; } }

function getReplyMenu(chatId, username) {
  let keyboard = [[{ text: "☎️ Get Number" }, { text: "📧 Temp Mail" }], [{ text: "🔑 2FA" }, { text: "👤 Profile" }]];
  if (isAdmin(chatId, username)) keyboard.push([{ text: "💬 Support" }, { text: "⚙️ Admin Panel" }]); else keyboard.push([{ text: "💬 Support" }]);
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

const platformMenu = { 
  inline_keyboard: [
    [{ text: "ⓕ Facebook", callback_data: "menu_country_fb" }],
    [{ text: "ⓘ Instagram", callback_data: "placeholder_ig" }],
    [{ text: "✆ WhatsApp", callback_data: "placeholder_wa" }],
    [{ text: "✖ Close Menu", callback_data: "close_menu" }]
  ] 
};

function getAdminMenu(chatId) {
  let menu = [ 
    [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" }, { text: "🔢 Set Number Limit", callback_data: "admin_set_limit" }], 
    [{ text: "⚙️ Manage Number", callback_data: "admin_manage_numbers" }] 
  ];
  if (isSuperAdmin(chatId)) menu.push([{ text: "👑 Manage Admins", callback_data: "admin_manage_admins" }, { text: "❌ Close Menu", callback_data: "close_menu" }]); else menu.push([{ text: "❌ Close Menu", callback_data: "close_menu" }]);
  return { inline_keyboard: menu };
}

const adminPlatformMenu = {
  inline_keyboard: [
    [{ text: "ⓕ Facebook", callback_data: "admin_sel_plat_fb" }],
    [{ text: "ⓘ Instagram", callback_data: "admin_sel_plat_ig" }],
    [{ text: "✆ WhatsApp", callback_data: "admin_sel_plat_wa" }],
    [{ text: "⬅️ Back", callback_data: "admin_panel" }]
  ]
};

const manageNumberPanel = {
  inline_keyboard: [
    [{ text: "IVA SMS 📨", callback_data: "admin_manage_ranges" }],
    [{ text: "Stex SMS 📩", callback_data: "placeholder_stex" }],
    [{ text: "MK SMS 💬", callback_data: "placeholder_mk" }],
    [{ text: "Add Number ➕", callback_data: "admin_add_number_manual" }],
    [{ text: "⬅️ Back", callback_data: "admin_manage_numbers" }]
  ]
};

function renderManageRangesMenu(chatId, messageId) {
  const rangesArray = tempAdminData[chatId] || []; let rangeButtons = [];
  rangesArray.forEach((r, index) => { let isAdded = db.availableNumbers[r.name] && db.availableNumbers[r.name].length > 0; rangeButtons.push([{ text: `${isAdded ? "✅" : "❌"} ${getCountryInfo(r.name).flag} ${r.name} (${r.nums.length})`, callback_data: `togglerng_${index}` }]); });
  rangeButtons.push([{ text: "📥 Add All", callback_data: "togglerng_addall" }, { text: "🗑️ Remove All", callback_data: "togglerng_delall" }]);
  rangeButtons.push([{ text: "🔄 Refresh List", callback_data: "refresh_manage_ranges" }, { text: "⬅️ Back", callback_data: "admin_sel_plat_fb" }]);
  bot.editMessageText("⚙️ **iVAS Manage Ranges:**\n\nClick a range to manually toggle its availability:", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rangeButtons }, parse_mode: "Markdown" }).catch(()=>{});
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id, username = msg.from.username;
  if (!await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);
  if (!db.users.includes(chatId)) {
      db.users.push(chatId); const refId = match[1];
      if (refId && Number(refId) !== chatId && !db.referred[chatId]) { db.referred[chatId] = Number(refId); addBalance(Number(refId), 10.00); bot.sendMessage(Number(refId), `🎉 **Congratulations!**\nA new user just joined using your referral link. 💰 **10.00 BDT** has been added to your balance.`, { parse_mode: "Markdown" }).catch(()=>{}); }
      saveDB();
  }
  bot.sendMessage(chatId, `Welcome to the bot! 👋\n\nPlease select an option from the menu below to get started:`, { reply_markup: getReplyMenu(chatId, username) });
});

bot.onText(/\/admin/, async (msg) => {
  if (!isAdmin(msg.chat.id, msg.from.username)) return bot.sendMessage(msg.chat.id, "❌ Access Denied. You do not have the required admin rights.");
  bot.sendMessage(msg.chat.id, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(msg.chat.id), parse_mode: "Markdown" });
});

bot.on('message', async (msg) => {
  const text = msg.text, chatId = msg.chat.id, username = msg.from.username;
  if (!text || text.startsWith('/')) return;
  if (!db.users.includes(chatId)) { db.users.push(chatId); saveDB(); }

  const triggerWords = ["☎️ Get Number", "📧 Temp Mail", "🔑 2FA", "👤 Profile", "💬 Support", "⚙️ Admin Panel"];
  if ((triggerWords.includes(text) || userStates[chatId]) && !await isUserMember(msg.from.id)) return sendJoinPrompt(chatId);
  if (triggerWords.includes(text)) delete userStates[chatId];

  if (text === "☎️ Get Number") { 
    clearPendingForChat(chatId); 
    bot.sendMessage(chatId, `🛠 Please select the platform you want to receive an OTP for:`, { reply_markup: platformMenu }); 
  } 
  else if (text === "📧 Temp Mail") {
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
            } catch (e) {
                // Ignore silent background errors
            }
        }, 3000);

        activeTempMails[chatId].timeout = setTimeout(() => {
            clearInterval(activeTempMails[chatId].interval);
            if (!activeTempMails[chatId].otpReceived) {
                bot.editMessageText(`📧 **Your Temp Mail:**\n\`${email}\`\n\n⚠️ **Session Expired (15m).**`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown" }).catch(()=>{});
            }
        }, 15 * 60 * 1000);

    } catch (e) {
        bot.sendMessage(chatId, `❌ **Temp mail generation failed.**\n_Reason: ${e.message}_`, { parse_mode: "Markdown" });
    }
  }
  else if (text === "👤 Profile") {
      bot.sendMessage(chatId, `👤 **Profile Info:**\n🆔 **User ID:** \`${chatId}\`\n📛 **Name:** ${msg.from.first_name || 'N/A'}\n🎭 **Role:** ${isAdmin(chatId, username) ? (isSuperAdmin(chatId) ? "Super Admin 👑" : "Admin 🛡️") : "User 👤"}\n💰 **Balance:** ${getBalance(chatId).toFixed(2)} BDT\n\n🔗 **Referral Link:**\n\`https://t.me/${botInfo.username}?start=${chatId}\`\n_(Invite friends and earn 10 BDT for each new user!)_`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💸 Withdraw", callback_data: "withdraw_funds" }]] } });
  }
  else if (text === "🔑 2FA") {
      userStates[chatId] = "WAITING_FOR_2FA_KEY";
      bot.sendMessage(chatId, "🔐 **Send your secret key:**\n(For example: `RTOX IVWV MK7A 5R7C...`)", { parse_mode: "Markdown" });
  }
  else if (userStates[chatId] === "WAITING_FOR_2FA_KEY") {
      try {
          const secret = text.replace(/\s+/g, '').toUpperCase();
          if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 10) throw new Error("Invalid");
          tempAdminData[chatId] = { active2FAKey: secret };
          bot.sendMessage(chatId, `🔐 **2FA Authenticator**\n━━━━━━━━━━\n🔑 **Code:** \`${authenticator.generate(secret)}\`\n🕒 **Refreshes in:** 30s\n━━━━━━━━━━\n_(Simply copy the code above and use it.)_`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh Code", callback_data: "refresh_2fa" }]] } });
      } catch (err) { bot.sendMessage(chatId, "❌ **Invalid Secret Key!**\nPlease make sure you provided a valid format.", { parse_mode: "Markdown" }); }
      delete userStates[chatId]; 
  }
  else if (text === "💬 Support") bot.sendMessage(chatId, "💬 **Support:**\nPlease contact our admin for any assistance. (@Excellentzqlt)", { parse_mode: "Markdown" });
  else if (text === "⚙️ Admin Panel" && isAdmin(chatId, username)) { bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }); }
  else if (userStates[chatId] === "WAITING_FOR_LIMIT" && isAdmin(chatId, username)) {
    const limit = parseInt(text);
    if (isNaN(limit) || limit < 1 || limit > 20) bot.sendMessage(chatId, "❌ Invalid input. Please enter a valid number between 1 and 20.");
    else { db.settings.maxNumbers = limit; saveDB(); bot.sendMessage(chatId, `✅ Successfully updated! Users will now be assigned **${limit}** numbers at a time.`); bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId) }); delete userStates[chatId]; }
  }
  else if (userStates[chatId] === "WAITING_FOR_MANUAL_COUNTRY" && isAdmin(chatId, username)) {
    const info = getCountryInfo(text.trim().toUpperCase());
    tempAdminData[chatId] = { ...tempAdminData[chatId], addNumberCountry: text.trim().toUpperCase() }; 
    userStates[chatId] = "WAITING_FOR_ADD_NUMBERS";
    bot.sendMessage(chatId, `✅ **Country Selected:** ${info.flag} ${info.cleanName}\n\nPlease paste the numbers below (each on a new line):`, { parse_mode: "Markdown" });
  }
  else if (userStates[chatId] === "WAITING_FOR_ADD_NUMBERS" && isAdmin(chatId, username)) {
    const country = tempAdminData[chatId]?.addNumberCountry; if (!country) { delete userStates[chatId]; return; }
    const numbers = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (!db.availableNumbers[country]) db.availableNumbers[country] = [];
    let added = 0; numbers.forEach(num => { if (!db.availableNumbers[country].includes(num)) { db.availableNumbers[country].push(num); added++; } }); saveDB();
    bot.sendMessage(chatId, `✅ Success! **${added}** numbers have been successfully added to ${country}.`, { parse_mode: "Markdown" }); 
    bot.sendMessage(chatId, "⚙️ **Manage Panel:**", { reply_markup: manageNumberPanel });
    delete userStates[chatId]; delete tempAdminData[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_BROADCAST" && isAdmin(chatId, username)) {
    bot.sendMessage(chatId, `⏳ Broadcasting your message to all users. Please wait...`); let successCount = 0;
    for (let uId of db.users) { try { await bot.sendMessage(uId, `📢 **Broadcast Message:**\n\n${text}`, { parse_mode: "Markdown" }); successCount++; } catch(e) {} }
    bot.sendMessage(chatId, `✅ **Broadcast Complete!** Your message was successfully sent to ${successCount} users.`); delete userStates[chatId];
  }
  else if (userStates[chatId] === "WAITING_FOR_BKASH") {
    if (/^(01[3-9]\d{8})$/.test(text)) {
      const currentBalance = getBalance(chatId); if (currentBalance < 50) { bot.sendMessage(chatId, `⚠️ Insufficient balance. You need at least 50 BDT to withdraw.`); delete userStates[chatId]; return; }
      bot.sendMessage(ADMIN_ID, `💸 **New Withdraw Request!**\n\n👤 **User ID:** \`${chatId}\`\n📞 **Account:** \`${text}\`\n💰 **Amount:** ${currentBalance.toFixed(2)} BDT`, { parse_mode: "Markdown" });
      bot.sendMessage(chatId, `✅ Your withdrawal request has been submitted successfully and is pending review.`); db.balances[chatId] = 0; saveDB(); delete userStates[chatId]; 
    } else bot.sendMessage(chatId, "❌ Invalid format. Please enter a valid 11-digit account number.");
  }
  else if (userStates[chatId] === "WAITING_FOR_ADMIN_USERNAME" && isSuperAdmin(chatId)) {
    let newAdmin = text.trim().toLowerCase(); if(!newAdmin.startsWith("@")) newAdmin = "@" + newAdmin;
    if(!db.adminUsernames.includes(newAdmin)) { db.adminUsernames.push(newAdmin); saveDB(); bot.sendMessage(chatId, `✅ **${newAdmin}** has been successfully added as an admin.`); }
    bot.sendMessage(chatId, "⚙️ **Admin Panel:**", { reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }); delete userStates[chatId];
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id, messageId = query.message.message_id, data = query.data, username = query.from.username;

  if (data === "check_join") {
    if (await isUserMember(query.from.id)) { bot.deleteMessage(chatId, messageId).catch(()=>{}); bot.sendMessage(chatId, `Welcome! 👋`, { reply_markup: getReplyMenu(chatId, username) }); return bot.answerCallbackQuery(query.id, { text: "✅ Thank you for joining! You can now use the bot." }); }
    else return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined the group yet. Please join first!", show_alert: true });
  }
  if (!await isUserMember(query.from.id)) return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined the group yet.", show_alert: true });
  
  const adminActs = ["admin_", "togglerng_", "refresh_", "deladmin_", "addnum_", "placeholder_stex", "placeholder_mk"];
  if (adminActs.some(a => data.startsWith(a)) && !isAdmin(chatId, username) && data !== "refresh_2fa") return bot.answerCallbackQuery(query.id, {text: "❌ Permission Denied! You do not have admin access for this action.", show_alert: true});

  if (data === "close_menu") { bot.deleteMessage(chatId, messageId).catch(()=>{}); return bot.answerCallbackQuery(query.id); }
  
  else if (data === "refresh_2fa") {
    const secret = tempAdminData[chatId]?.active2FAKey;
    if (!secret) return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired! Please generate a new code.", show_alert: true });
    try {
      bot.editMessageText(`🔐 **2FA Authenticator**\n━━━━━━━━━━\n🔑 **Code:** \`${authenticator.generate(secret)}\`\n🕒 **Refreshes in:** 30s\n━━━━━━━━━━\n_(Simply copy the code above and use it.)_`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh Code", callback_data: "refresh_2fa" }]] } }).catch(()=>{});
      bot.answerCallbackQuery(query.id, { text: "🔄 Code refreshed successfully!" });
    } catch (e) { bot.answerCallbackQuery(query.id, { text: "❌ Error refreshing the code." }); }
  }

  else if (data === "admin_manage_numbers") {
    bot.editMessageText("🛠 **Please select the platform for managing numbers:**", { chat_id: chatId, message_id: messageId, reply_markup: adminPlatformMenu });
    bot.answerCallbackQuery(query.id);
  }
  else if (data.startsWith("admin_sel_plat_")) {
    tempAdminData[chatId] = { ...tempAdminData[chatId], selectedPlatform: data.split('_')[3] };
    bot.editMessageText("🛠 **Please select a panel to manage:**", { chat_id: chatId, message_id: messageId, reply_markup: manageNumberPanel });
    bot.answerCallbackQuery(query.id);
  }
  else if (data === "placeholder_stex" || data === "placeholder_mk" || data === "placeholder_ig" || data === "placeholder_wa") {
      bot.answerCallbackQuery(query.id, { text: "🛠 This service/logic is not integrated yet.", show_alert: true });
  }

  else if (data === "admin_add_number_manual") {
    userStates[chatId] = "WAITING_FOR_MANUAL_COUNTRY";
    bot.sendMessage(chatId, "🌍 **Enter the country name:**\n(For example: PAKISTAN, USA, BANGLADESH)", { parse_mode: "Markdown" });
    bot.answerCallbackQuery(query.id);
  }
  else if (data === "admin_set_limit") { userStates[chatId] = "WAITING_FOR_LIMIT"; bot.sendMessage(chatId, `🔢 **Please enter the new number limit:**`); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_broadcast") { userStates[chatId] = "WAITING_FOR_BROADCAST"; bot.sendMessage(chatId, "📢 **Please type the message you want to broadcast:**"); bot.answerCallbackQuery(query.id); }
  else if (data === "withdraw_funds") { userStates[chatId] = "WAITING_FOR_BKASH"; bot.sendMessage(chatId, "💸 **Please enter your 11-digit bKash or Nagad number:**"); bot.answerCallbackQuery(query.id); }
  
  else if (data === "menu_country_fb") {
    clearPendingForChat(chatId); const ranges = Object.keys(db.availableNumbers).filter(k => db.availableNumbers[k].length > 0);
    if (ranges.length === 0) return bot.editMessageText(`⚠️ We are currently out of stock. Please check back later.`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "menu_platform" }]] } });
    let baseCountryCount = {}, currentV = {}, countryButtons = [];
    ranges.forEach(r => { let i = getCountryInfo(r); baseCountryCount[i.cleanName] = (baseCountryCount[i.cleanName] || 0) + 1; });
    ranges.forEach(range => { let info = getCountryInfo(range), dName = `${info.flag} ${info.cleanName}`; if (baseCountryCount[info.cleanName] > 1) { currentV[info.cleanName] = (currentV[info.cleanName] || 0) + 1; dName += ` V${currentV[info.cleanName]}`; } countryButtons.push([{ text: `${dName} | 📦: ${db.availableNumbers[range].length}`, callback_data: `assign_${range}` }]); });
    countryButtons.push([{ text: "✖ Close Menu", callback_data: "close_menu" }, { text: "⬅️ Back", callback_data: "menu_platform" }]);
    bot.editMessageText(`🌍 Select a country from the available options:`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: countryButtons } }); bot.answerCallbackQuery(query.id);
  }
  else if (data === "menu_platform") { clearPendingForChat(chatId); bot.editMessageText(`🛠 Please select the platform you want to receive an OTP for:`, { chat_id: chatId, message_id: messageId, reply_markup: platformMenu }); bot.answerCallbackQuery(query.id); }
  
  else if (data.startsWith("assign_")) {
    const sel = data.replace("assign_next_", "").replace("assign_", ""); clearPendingForChat(chatId);
    const nums = db.availableNumbers[sel] || [];
    if (nums.length === 0) return bot.answerCallbackQuery(query.id, { text: `⚠️ This country is currently out of stock!`, show_alert: true });
    
    const limit = db.settings.maxNumbers || 4, assignedNums = nums.splice(0, limit);
    db.lastAssigned[chatId] = { country: sel, nums: [...assignedNums] }; saveDB();
    
    assignedNums.forEach(n => {
        inUseNumbers[n] = true;
        pendingRequests[n] = { chatId: chatId, country: sel };
    });

    const info = getCountryInfo(sel);
    let replyText = `🤖 **${botInfo.first_name || "eSIM Bot"}**\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n\n👇 _Click a number below to copy:_`;
    
    let actionMenu = { inline_keyboard: [] };
    assignedNums.forEach(n => {
        actionMenu.inline_keyboard.push([{ text: `${info.flag} +${n}`, copy_text: { text: n } }]);
    });
    
    actionMenu.inline_keyboard.push([
        { text: "🔄 Change", callback_data: `assign_next_${sel}` },
        { text: "↗️ OTP Group", url: GROUP_INVITE_LINK }
    ]);
    actionMenu.inline_keyboard.push([{ text: "🔙 Back", callback_data: "menu_country_fb" }]);
    
    bot.editMessageText(replyText, { chat_id: chatId, message_id: messageId, reply_markup: actionMenu, parse_mode: "Markdown" }).catch(()=>{});
    bot.answerCallbackQuery(query.id);
  }
  
  else if (data === "admin_panel") { bot.editMessageText("⚙️ **Admin Panel:**", { chat_id: chatId, message_id: messageId, reply_markup: getAdminMenu(chatId), parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_manage_ranges" || data === "refresh_manage_ranges") {
    bot.answerCallbackQuery(query.id, { text: "🔄 Loading data from extension..." });
    let grouped = { ...latestRangesFromExtension };
    for (const r in db.availableNumbers) { if (!grouped[r]) grouped[r] = db.availableNumbers[r]; }
    tempAdminData[chatId] = { ...tempAdminData[chatId], ranges: Object.keys(grouped).map(r => ({ name: r, nums: grouped[r] })) };
    if (tempAdminData[chatId].ranges.length === 0) return bot.editMessageText("📭 **No data found!** Please ensure your browser extension is active.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "admin_sel_plat_fb" }]] }, parse_mode: "Markdown" });
    renderManageRangesMenu(chatId, messageId);
  }
  else if (data.startsWith("togglerng_")) {
    const action = data.replace("togglerng_", ""); if (!tempAdminData[chatId]?.ranges) return bot.answerCallbackQuery(query.id, { text: "⚠️ Session expired! Please fetch ranges again.", show_alert: true });
    if (action === "addall") { let t = 0; tempAdminData[chatId].ranges.forEach(r => { if (!db.availableNumbers[r.name]) db.availableNumbers[r.name] = []; r.nums.forEach(num => { if (!db.availableNumbers[r.name].includes(num) && !inUseNumbers[num]) { db.availableNumbers[r.name].push(num); t++; } }); }); saveDB(); bot.answerCallbackQuery(query.id, { text: `✅ Successfully added all ${t} available numbers.` }); }
    else if (action === "delall") { tempAdminData[chatId].ranges.forEach(r => { delete db.availableNumbers[r.name]; }); saveDB(); bot.answerCallbackQuery(query.id, { text: `🗑️ Successfully removed all numbers from the active list.` }); }
    else { const idx = parseInt(action), sel = tempAdminData[chatId].ranges[idx]; if (db.availableNumbers[sel.name]) { delete db.availableNumbers[sel.name]; saveDB(); bot.answerCallbackQuery(query.id, { text: `❌ Removed range from active list.` }); } else { db.availableNumbers[sel.name] = []; let a = 0; sel.nums.forEach(num => { if (!inUseNumbers[num]) { db.availableNumbers[sel.name].push(num); a++; } }); saveDB(); bot.answerCallbackQuery(query.id, { text: `✅ Added range successfully (${a} numbers).` }); } }
    renderManageRangesMenu(chatId, messageId);
  }
  else if (data === "admin_manage_admins") { if (!isSuperAdmin(chatId)) return; bot.editMessageText("👑 **Manage Admins:**\nSelect an option to add or remove bot administrators.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "➕ Add Admin", callback_data: "admin_add_admin" }, { text: "➖ Remove", callback_data: "admin_remove_admin" }], [{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_add_admin") { if (!isSuperAdmin(chatId)) return; userStates[chatId] = "WAITING_FOR_ADMIN_USERNAME"; bot.sendMessage(chatId, "👤 **Please enter the Telegram Username you wish to make an admin:**"); bot.answerCallbackQuery(query.id); }
  else if (data === "admin_remove_admin") { if (!isSuperAdmin(chatId)) return; if (db.adminUsernames.length === 0) return bot.answerCallbackQuery(query.id, { text: "📭 No admins found in the system.", show_alert: true }); let btns = db.adminUsernames.map(un => [{ text: `❌ Remove ${un}`, callback_data: `deladmin_${un}` }]); btns.push([{ text: "⬅️ Back", callback_data: "admin_manage_admins" }]); bot.editMessageText("🗑️ **Select an administrator to remove:**", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" }); bot.answerCallbackQuery(query.id); }
  else if (data.startsWith("deladmin_")) { if (!isSuperAdmin(chatId)) return; let unToRemove = data.replace("deladmin_", ""); db.adminUsernames = db.adminUsernames.filter(u => u !== unToRemove); saveDB(); bot.answerCallbackQuery(query.id, { text: `✅ Admin successfully removed!`, show_alert: true }); bot.editMessageText("👑 **Manage Admins:**\nSelect an option to add or remove bot administrators.", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "➕ Add Admin", callback_data: "admin_add_admin" }, { text: "➖ Remove", callback_data: "admin_remove_admin" }], [{ text: "⬅️ Back", callback_data: "admin_panel" }]] }, parse_mode: "Markdown" }); }
});

// 🟢 NEW: Separate OTP Message with beautiful formatting and copy buttons
function processFoundOTP(number, time, message, range) {
  const uniqueId = `${number}_${time}`; if (lastProcessedOTPTime[uniqueId]) return; lastProcessedOTPTime[uniqueId] = true;      
  let otpMatch = message.match(/\b\d{5,8}\b/), otpCode = otpMatch ? otpMatch[0] : null;
  
  // 🟢 Group Broadcast with the new format and "Get Number" button
  const info = getCountryInfo(range || "UNKNOWN");
  let groupReplyText = `☁️ **eSIM OTP** ☁️\n✅ **New OTP Received!**\n\n🌍 **Country:** ${info.flag} ${info.cleanName.toUpperCase()}\n📞 **Number:** \`${number}\`\n💌 **Full SMS:** ${message}`;
  let groupMarkup = {
      inline_keyboard: [[{ text: "☎️ Get Number", url: `https://t.me/${botInfo.username || "eSIM_OTP_Bot"}` }]]
  };
  bot.sendMessage(GROUP_CHAT_ID, groupReplyText, { parse_mode: "Markdown", reply_markup: groupMarkup }).catch(()=>{});

  if (pendingRequests[number]) {
    const reqData = pendingRequests[number];
    const reqInfo = getCountryInfo(reqData.country);
    
    // 🟢 User Direct Message for OTP
    let userReplyText = `☁️ **eSIM OTP** ☁️\n✅ **New OTP Received!**\n\n🌍 **Country:** ${reqInfo.flag} ${reqInfo.cleanName.toUpperCase()}\n📞 **Number:** \`${number}\`\n💌 **Full SMS:** ${message}`;
    let userMarkup = { inline_keyboard: [] };
    
    if (otpCode) {
        userMarkup.inline_keyboard.push([{ text: `📋 Copy Code`, copy_text: { text: otpCode } }]);
    }
    
    bot.sendMessage(reqData.chatId, userReplyText, { parse_mode: "Markdown", reply_markup: userMarkup.inline_keyboard.length > 0 ? userMarkup : undefined }).catch(()=>{});
    
    addBalance(reqData.chatId, 0.50); 
    delete pendingRequests[number]; 
    delete inUseNumbers[number]; 
  }
}

app.post('/api/ivas-data', (req, res) => {
  const { type, payload } = req.body;
  if (type === 'RANGES') { latestRangesFromExtension = payload; return res.status(200).json({ success: true }); } 
  else if (type === 'SMS_LOG') { if (Array.isArray(payload)) payload.forEach(sms => processFoundOTP(sms.number, sms.time, sms.message, sms.range)); return res.status(200).json({ success: true }); }
  res.status(400).json({ success: false });
});

app.get('/', (req, res) => res.status(200).send('Bot is successfully running on Hybrid Mode!'));

mongoose.connect(MONGODB_URI).then(async () => {
  const data = await BotDB.findOne(); if (data) db = { ...db, ...data.toObject() }; else await BotDB.create(db);
  isDbLoaded = true; app.listen(PORT, () => console.log(`🚀 Hybrid Mode running on port ${PORT}`));
}).catch(err => console.log(err));
