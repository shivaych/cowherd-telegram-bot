import { NextRequest, NextResponse } from "next/server";
import { dbAcharya, dbConfigured, dbGunakul, getAcharyaId } from "@/lib/server/supabase";
import { normalizeIndianPhone } from "@/lib/phone";
import {
  evaluateApply,
  fallbackQuizQuestions,
  generateChatReply,
  generateQuizQuestions,
  type QuizQuestion,
} from "@/lib/server/gemini";
import {
  answerCallbackQuery,
  getFileAsDataUrl,
  sendMessage,
  type ReplyMarkup,
} from "@/lib/server/telegram";

export const runtime = "nodejs";
export const preferredRegion = "bom1";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
type Lang = "bn" | "hi" | "en";

const I18N: Record<string, Record<string, string>> = {
  home:           { en: "Home",                       hi: "होम",              bn: "হোম" },
  modules:        { en: "Learn Modules",              hi: "मॉड्यूल सीखें",   bn: "মডিউল শিখুন" },
  videos:         { en: "Videos",                     hi: "वीडियो",           bn: "ভিডিও" },
  quiz:           { en: "Quiz",                       hi: "क्विज़",           bn: "কুইজ" },
  ask:            { en: "Ask Gopal",                  hi: "गोपाल से पूछें",  bn: "গোপালকে জিজ্ঞাসা করুন" },
  apply:          { en: "Field Report",               hi: "फील्ड रिपोर्ट",   bn: "ফিল্ড রিপোর্ট" },
  language:       { en: "Language",                   hi: "भाषा",             bn: "ভাষা" },
  progress:       { en: "My Progress",                hi: "मेरी प्रगति",     bn: "আমার অগ্রগতি" },
  logout:         { en: "Logout",                     hi: "लॉगआउट",          bn: "লগআউট" },
  login_prompt: {
    en: "Welcome to Cowherd Acharya — Gopal's cattle and horse care training.\n\nPlease share your phone number to continue.",
    hi: "Cowherd Acharya में आपका स्वागत है — गोपाल की गाय और घोड़े की देखभाल की ट्रेनिंग।\n\nकृपया अपना फोन नंबर दें।",
    bn: "Cowherd Acharya-এ স্বাগতম — গোপালের গরু ও ঘোড়ার পরিচর্যার প্রশিক্ষণ।\n\nঅনুগ্রহ করে আপনার ফোন নম্বর দিন।",
  },
  share_phone:    { en: "Share my phone number",      hi: "फोन नंबर शेयर करें", bn: "ফোন নম্বর শেয়ার করুন" },
  type_phone:     { en: "Type phone number",          hi: "फोन नंबर टाइप करें",  bn: "ফোন নম্বর টাইপ করুন" },
  login_complete: { en: "Login complete. Welcome!",   hi: "लॉगिन हो गया। स्वागत है!", bn: "লগইন সম্পন্ন। স্বাগতম!" },
  not_registered: {
    en: "Your number is not registered for this program. Please contact your coordinator to get access.",
    hi: "आपका नंबर इस कार्यक्रम में पंजीकृत नहीं है। एक्सेस के लिए अपने कोऑर्डिनेटर से संपर्क करें।",
    bn: "আপনার নম্বর এই কার্যক্রমে নিবন্ধিত নেই। অ্যাক্সেসের জন্য আপনার কোঅর্ডিনেটরের সাথে যোগাযোগ করুন।",
  },
  logged_out:     { en: "You have been logged out.",  hi: "आप लॉग आउट हो गए।", bn: "আপনি লগআউট হয়েছেন।" },
  ask_mode:       {
    en: "Ask mode is on. Send your question about cattle or horse care.",
    hi: "पूछताछ मोड चालू है। गाय या घोड़े की देखभाल के बारे में प्रश्न भेजें।",
    bn: "জিজ্ঞাসা মোড চালু। গরু বা ঘোড়ার পরিচর্যা সম্পর্কে প্রশ্ন পাঠান।",
  },
  apply_mode:     {
    en: "Field report mode is on. Tell Gopal what you did with the animals today. You can send text or a photo.",
    hi: "फील्ड रिपोर्ट मोड चालू है। आज आपने जानवरों के साथ क्या किया गोपाल को बताएं। टेक्स्ट या फोटो भेज सकते हैं।",
    bn: "ফিল্ড রিপোর্ট মোড চালু। আজ পশুদের সাথে কী করেছেন গোপালকে বলুন। টেক্সট বা ছবি পাঠাতে পারেন।",
  },
  choose_module:  { en: "Choose a learning module",  hi: "एक मॉड्यूल चुनें", bn: "একটি মডিউল বেছে নিন" },
  choose_quiz:    { en: "Choose a module for quiz",   hi: "क्विज़ के लिए मॉड्यूल चुनें", bn: "কুইজের জন্য মডিউল বেছে নিন" },
  next:           { en: "Next",                       hi: "अगला",             bn: "পরবর্তী" },
  prev:           { en: "Previous",                   hi: "पिछला",            bn: "পূর্ববর্তী" },
  thinking:       { en: "Thinking...",                hi: "सोच रहा हूँ...",   bn: "ভাবছি..." },
  reviewing:      { en: "Reviewing your field report...", hi: "आपकी फील्ड रिपोर्ट की समीक्षा हो रही है...", bn: "আপনার ফিল্ড রিপোর্ট পর্যালোচনা করা হচ্ছে..." },
  send_question:  { en: "Send a question, or use /courses, /quiz, /apply.", hi: "प्रश्न भेजें, या /courses, /quiz, /apply उपयोग करें।", bn: "প্রশ্ন পাঠান, অথবা /courses, /quiz, /apply ব্যবহার করুন।" },
  no_progress:    { en: "No progress yet.",           hi: "अभी तक कोई प्रगति नहीं।", bn: "এখনও কোন অগ্রগতি নেই।" },
  course_progress:{ en: "Your Course Progress",      hi: "आपकी कोर्स प्रगति", bn: "আপনার কোর্স অগ্রগতি" },
  recent_activity:{ en: "Recent Activity",            hi: "हाल की गतिविधि",   bn: "সাম্প্রতিক কার্যকলাপ" },
  mark_complete:  { en: "Mark complete",              hi: "पूर्ण चिह्नित करें", bn: "সম্পন্ন চিহ্নিত করুন" },
};

function t(key: string, lang: Lang = "en"): string {
  return I18N[key]?.[lang] || I18N[key]?.en || key;
}

function isCmd(text: string, key: string): boolean {
  return text === I18N[key]?.en || text === I18N[key]?.hi || text === I18N[key]?.bn;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TelegramUser { id: number; first_name?: string; username?: string; }

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  contact?: { phone_number?: string; user_id?: number };
  photo?: Array<{ file_id: string; file_size?: number }>;
  voice?: { file_id: string; duration?: number; mime_type?: string };
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { message_id?: number; chat: { id: number } };
  data?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramAccount {
  id: string;
  acharya_id: string | null;
  user_id: string | null;
  telegram_user_id: number;
  telegram_chat_id: number;
  username: string | null;
  first_name: string | null;
  preferred_lang: Lang;
  selected_module_id: string; // module SLUG e.g. 'M01-daily-care'
  mode: "ask" | "apply";
  state: Record<string, unknown>;
}

interface VideoRow {
  id: string;
  youtube_id: string;
  title: string;
  sort_order: number;
}

interface ModuleRow {
  id: string;       // UUID
  slug: string;
  title_bn: string;
  title_hi: string;
  title_en: string;
  sort_order: number;
}

interface SectionRow {
  id: string;       // UUID
  module_id: string;
  title_bn: string;
  title_hi: string;
  title_en: string;
  body_bn: string | null;
  body_hi: string | null;
  body_en: string | null;
  sort_order: number;
}

interface QuizState {
  type: "quiz";
  moduleId: string; // slug
  questions: QuizQuestion[];
  index: number;
  score: number;
  answers: number[];
}

// ---------------------------------------------------------------------------
// Webhook entry
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (configuredSecret) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!dbConfigured) return NextResponse.json({ ok: true });

  const acharyaId = await getAcharyaId();
  if (!acharyaId) {
    console.error("[telegram] acharya not found — check NEXT_PUBLIC_ACHARYA_SLUG");
    return NextResponse.json({ ok: true });
  }

  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  try {
    if (update.callback_query) await handleCallback(update.callback_query, acharyaId);
    else if (update.message) await handleMessage(update.message, acharyaId);
  } catch (err) {
    console.error("[telegram] webhook error:", err);
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
    if (chatId) {
      const detail = process.env.NODE_ENV === "development" && err instanceof Error
        ? `\n\nDev detail: ${err.message.slice(0, 400)}` : "";
      await sendMessage(chatId, `Something went wrong. Please try again.${detail}`);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "cowherd-telegram-webhook" });
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessage(message: TelegramMessage, acharyaId: string) {
  const from = message.from;
  if (!from) return;
  const chatId = message.chat.id;
  const account = await getOrCreateAccount(from, chatId, acharyaId);
  const text = (message.text || message.caption || "").trim();

  // Phone contact share
  if (message.contact?.phone_number) {
    await linkContact(account, message, acharyaId);
    return;
  }

  // Not logged in
  if (!account.user_id) {
    const typedPhone = normalizeIndianPhone(text);
    if (typedPhone) { await linkPhone(account, chatId, typedPhone, acharyaId); return; }
    if (!account.state.lang_selected) {
      await sendInitialLanguagePicker(chatId);
      return;
    }
    await requestPhone(chatId, account.preferred_lang);
    return;
  }

  // Commands
  if (text === "/start" || isCmd(text, "home")) { await sendHome(chatId, account, acharyaId); return; }
  if (text === "/logout" || isCmd(text, "logout")) {
    await dbGunakul.from("telegram_accounts").update({ user_id: null, phone: null, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendMessage(chatId, t("logged_out", account.preferred_lang), { remove_keyboard: true });
    await requestPhone(chatId, account.preferred_lang);
    return;
  }
  if (text === "/help") { await sendHelp(chatId, account); return; }
  if (text === "/courses" || isCmd(text, "modules")) { await sendCourses(chatId, account.preferred_lang, 1); return; }
  if (text === "/ask" || isCmd(text, "ask")) {
    await setAccountMode(account.id, "ask");
    await sendMessage(chatId, t("ask_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
    return;
  }
  if (text === "/apply" || isCmd(text, "apply")) {
    await setAccountMode(account.id, "apply");
    await sendMessage(chatId, t("apply_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
    return;
  }
  if (text === "/quiz" || isCmd(text, "quiz")) { await sendModulePicker(chatId, "quiz", account.preferred_lang, 1); return; }
  if (text === "/progress" || isCmd(text, "progress")) { await sendProgress(chatId, account, acharyaId); return; }
  if (text === "/lang" || isCmd(text, "language")) { await sendLanguagePicker(chatId); return; }

  if (isCmd(text, "videos") || text === "/videos") {
    await sendVideos(chatId, account.preferred_lang);
    return;
  }

  // Quiz in progress
  if (isQuizState(account.state)) {
    await sendMessage(chatId, "Please finish the current quiz using the buttons, or send /quiz to restart.");
    return;
  }

  // Apply mode
  if (account.mode === "apply") { await handleApplyMessage(chatId, account, message, acharyaId); return; }

  // Default: ask mode
  if (!text && !message.voice) { await sendMessage(chatId, t("send_question", account.preferred_lang)); return; }
  await handleAskMessage(chatId, account, text, acharyaId, message.voice);
}

// ---------------------------------------------------------------------------
// Callback handler
// ---------------------------------------------------------------------------
async function handleCallback(query: TelegramCallbackQuery, acharyaId: string) {
  const chatId = query.message?.chat.id;
  const data = query.data || "";
  if (!chatId) return;
  await answerCallbackQuery(query.id);
  const account = await getOrCreateAccount(query.from, chatId, acharyaId);

  if (!account.user_id && !data.startsWith("lang:") && !data.startsWith("confirm_lang:") && data !== "cancel_lang") {
    await requestPhone(chatId, account.preferred_lang);
    return;
  }

  if (data.startsWith("confirm_lang:")) {
    const lang = data.slice(13) as Lang;
    if (!["bn", "hi", "en"].includes(lang)) return;
    const confirmMsg = lang === "hi" ? "क्या आप भाषा हिंदी में बदलना चाहते हैं?" :
                       lang === "bn" ? "আপনি কি ভাষা বাংলায় পরিবর্তন করতে চান?" :
                       "Do you want to change the language to English?";
    const yesText = lang === "hi" ? "हाँ" : lang === "bn" ? "হ্যাঁ" : "Yes";
    const noText  = lang === "hi" ? "नहीं" : lang === "bn" ? "না" : "No";
    await sendMessage(chatId, confirmMsg, { inline_keyboard: [[
      { text: yesText, callback_data: `lang:${lang}` },
      { text: noText,  callback_data: "cancel_lang" },
    ]] });
    return;
  }
  if (data === "cancel_lang") { await sendMessage(chatId, "Language change cancelled."); return; }
  if (data.startsWith("lang:")) {
    const lang = data.slice(5) as Lang;
    if (!["bn", "hi", "en"].includes(lang)) return;
    const nextState = { ...account.state, lang_selected: true };
    await dbGunakul.from("telegram_accounts").update({
      preferred_lang: lang,
      state: nextState,
      updated_at: new Date().toISOString(),
    }).eq("id", account.id);
    if (account.user_id) {
      await dbGunakul.from("mst_users").update({ preferred_lang: lang }).eq("id", account.user_id).then(() => {});
      await sendHome(chatId, { ...account, preferred_lang: lang }, acharyaId);
    } else {
      await requestPhone(chatId, lang);
    }
    return;
  }

  if (data === "courses") { await sendCourses(chatId, account.preferred_lang, 1); return; }
  if (data === "ask") { await setAccountMode(account.id, "ask"); await sendMessage(chatId, t("ask_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang)); return; }
  if (data === "apply") { await setAccountMode(account.id, "apply"); await sendMessage(chatId, t("apply_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang)); return; }
  if (data === "quiz") { await sendModulePicker(chatId, "quiz", account.preferred_lang, 1); return; }
  if (data === "progress") { await sendProgress(chatId, account, acharyaId); return; }
  if (data === "lang") { await sendLanguagePicker(chatId); return; }

  if (data.startsWith("modpage:")) { await sendCourses(chatId, account.preferred_lang, parseInt(data.slice(8), 10)); return; }
  if (data.startsWith("quizpage:")) { await sendModulePicker(chatId, "quiz", account.preferred_lang, parseInt(data.slice(9), 10)); return; }

  if (data.startsWith("mod:")) {
    const moduleSlug = data.slice(4);
    await dbGunakul.from("telegram_accounts").update({ selected_module_id: moduleSlug, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendSections(chatId, moduleSlug, account.preferred_lang);
    return;
  }
  if (data.startsWith("section:")) {
    // format: section:<module_slug>:<section_uuid>
    const rest = data.slice(8);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) return;
    const moduleSlug = rest.slice(0, colonIdx);
    const sectionId = rest.slice(colonIdx + 1);
    await sendSection(chatId, sectionId, moduleSlug, account.preferred_lang);
    return;
  }
  if (data.startsWith("done:")) {
    const [, moduleSlug, sectionId] = data.split(":");
    await markSectionComplete(account, moduleSlug, sectionId, acharyaId);
    await sendMessage(chatId, "Marked complete.", persistentMainMenu(account.preferred_lang));
    return;
  }
  if (data.startsWith("quizmod:")) {
    await startQuiz(chatId, account, data.slice(8), acharyaId);
    return;
  }
  if (data.startsWith("ans:")) {
    await handleQuizAnswer(chatId, account, Number(data.slice(4)), acharyaId);
    return;
  }
}

// ---------------------------------------------------------------------------
// Account management
// ---------------------------------------------------------------------------
async function getOrCreateAccount(user: TelegramUser, chatId: number, acharyaId: string): Promise<TelegramAccount> {
  const { data: existing, error: existingError } = await dbGunakul
    .from("telegram_accounts")
    .select("*")
    .eq("telegram_user_id", user.id)
    .eq("acharya_id", acharyaId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return normalizeAccount(existing as Record<string, unknown>);

  const { data, error } = await dbGunakul
    .from("telegram_accounts")
    .insert({
      telegram_user_id: user.id,
      telegram_chat_id: chatId,
      acharya_id: acharyaId,
      username: user.username || null,
      first_name: user.first_name || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return normalizeAccount(data as Record<string, unknown>);
}

function normalizeAccount(row: Record<string, unknown>): TelegramAccount {
  return {
    id: String(row.id),
    acharya_id: typeof row.acharya_id === "string" ? row.acharya_id : null,
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    telegram_user_id: Number(row.telegram_user_id),
    telegram_chat_id: Number(row.telegram_chat_id),
    username: typeof row.username === "string" ? row.username : null,
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    preferred_lang: isLang(row.preferred_lang) ? row.preferred_lang : "bn",
    selected_module_id: typeof row.selected_module_id === "string" ? row.selected_module_id : "M01-daily-care",
    mode: row.mode === "apply" ? "apply" : "ask",
    state: row.state && typeof row.state === "object" && !Array.isArray(row.state)
      ? row.state as Record<string, unknown> : {},
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function linkContact(account: TelegramAccount, message: TelegramMessage, acharyaId: string) {
  const chatId = message.chat.id;
  if (message.contact?.user_id && message.from?.id && message.contact.user_id !== message.from.id) {
    await sendMessage(chatId, "Please share your own phone number using the button.");
    return;
  }
  const phone = normalizeIndianPhone(message.contact?.phone_number || "");
  if (!phone) { await sendMessage(chatId, "Please share a valid Indian mobile number."); return; }
  await linkPhone(account, chatId, phone, acharyaId);
}

async function linkPhone(account: TelegramAccount, chatId: number, phone: string, acharyaId: string) {
  // Users must be pre-registered — no self-signup
  const { data, error } = await dbGunakul
    .from("mst_users")
    .select(`
      id, name, preferred_lang,
      category:mst_categories!mst_users_category_id_fkey!inner (
        slug,
        map_category_acharya!inner ( acharya_id )
      )
    `)
    .eq("phone", phone)
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("category.map_category_acharya.acharya_id", acharyaId)
    .maybeSingle();

  if (error || !data) {
    await sendMessage(chatId, t("not_registered", account.preferred_lang));
    await requestPhone(chatId, account.preferred_lang);
    return;
  }

  const user = data as { id: string; name: string | null; preferred_lang: string | null };
  const lang = isLang(user.preferred_lang) ? user.preferred_lang as Lang : account.preferred_lang;

  await dbGunakul.from("telegram_accounts").update({
    user_id: user.id, phone, preferred_lang: lang, updated_at: new Date().toISOString(),
  }).eq("id", account.id);

  // Fire-and-forget last_seen bump
  dbGunakul.from("mst_users").update({ last_seen_on: new Date().toISOString() }).eq("id", user.id).then(() => {});

  await sendMessage(chatId, t("login_complete", lang), { remove_keyboard: true });
  await sendHome(chatId, { ...account, user_id: user.id, preferred_lang: lang }, acharyaId);
}

async function requestPhone(chatId: number, lang: Lang = "bn") {
  await sendMessage(chatId, t("login_prompt", lang), {
    keyboard: [
      [{ text: t("share_phone", lang), request_contact: true }],
      [{ text: t("type_phone", lang) }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

// ---------------------------------------------------------------------------
// Home & navigation
// ---------------------------------------------------------------------------
async function sendHome(chatId: number, account: TelegramAccount, acharyaId: string) {
  const modules = await getModules();
  let completedCount = 0;
  if (account.user_id) {
    const { data } = await dbGunakul.from("log_progress")
      .select("module_id")
      .eq("user_id", account.user_id)
      .eq("acharya_id", acharyaId)
      .eq("completed", true);
    completedCount = (data || []).length;
  }

  const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
  const dateStr = new Date().toLocaleDateString("en-IN", options);

  await sendMessage(
    chatId,
    `Gopal - Cowherd Acharya\n${dateStr}\nModules completed: ${completedCount}/${modules.length}\nCurrent module: ${account.selected_module_id}\nAsk a question about cattle or horse care, or choose a tool below.`,
    persistentMainMenu(account.preferred_lang),
  );
}

function persistentMainMenu(lang: Lang = "bn"): ReplyMarkup {
  return {
    keyboard: [
      [{ text: t("home", lang) },     { text: t("modules", lang) }],
      [{ text: t("videos", lang) },   { text: t("quiz", lang) }],
      [{ text: t("ask", lang) },      { text: t("apply", lang) }],
      [{ text: t("language", lang) }, { text: t("progress", lang) }],
      [{ text: t("logout", lang) }],
    ],
    resize_keyboard: true,
  };
}

async function sendHelp(chatId: number, account: TelegramAccount) {
  await sendMessage(chatId,
    "/ask - ask Gopal a question\n/quiz - take a quiz\n/apply - submit a field report\n/courses - browse learning modules\n/progress - view your progress\n/lang - change language",
    persistentMainMenu(account.preferred_lang));
}

async function sendLanguagePicker(chatId: number) {
  await sendMessage(chatId, "Choose your language / भाषा चुनें / ভাষা বেছে নিন", {
    inline_keyboard: [[
      { text: "English", callback_data: "confirm_lang:en" },
      { text: "Hindi", callback_data: "confirm_lang:hi" },
      { text: "Bengali", callback_data: "confirm_lang:bn" },
    ]],
  });
}

async function sendInitialLanguagePicker(chatId: number) {
  await sendMessage(
    chatId,
    "Welcome to Cowherd Acharya.\nस्वागत है। কৃপया আপনার ভাষা বেছে নিন।\n\nPlease choose your language / भाषा चुनें / ভাষা বেছে নিন",
    {
      inline_keyboard: [[
        { text: "English", callback_data: "lang:en" },
        { text: "हिंदी", callback_data: "lang:hi" },
        { text: "বাংলা", callback_data: "lang:bn" },
      ]],
    },
  );
}

// ---------------------------------------------------------------------------
// Module & section queries (handles crs_module_tr / crs_section_tr joins)
// ---------------------------------------------------------------------------
async function getModules(): Promise<ModuleRow[]> {
  const { data, error } = await dbAcharya
    .from("crs_modules")
    .select("id, slug, sort_order, crs_module_tr(lang, title)")
    .eq("is_deleted", false)
    .order("sort_order");
  if (error) throw error;
  return (data || []).map((m) => {
    const trs = (m.crs_module_tr || []) as Array<{ lang: string; title: string | null }>;
    const pick = (l: string) => trs.find((t) => t.lang === l);
    const en = pick("en"); const bn = pick("bn"); const hi = pick("hi");
    return {
      id: m.id as string,
      slug: m.slug as string,
      sort_order: m.sort_order as number,
      title_en: en?.title || (m.slug as string),
      title_bn: bn?.title || en?.title || (m.slug as string),
      title_hi: hi?.title || en?.title || (m.slug as string),
    };
  });
}

async function getModuleUuid(slug: string): Promise<string | null> {
  const { data } = await dbAcharya
    .from("crs_modules")
    .select("id")
    .eq("slug", slug)
    .eq("is_deleted", false)
    .maybeSingle();
  return data ? (data.id as string) : null;
}

async function getSections(moduleUuid: string): Promise<SectionRow[]> {
  const { data, error } = await dbAcharya
    .from("crs_sections")
    .select("id, module_id, sort_order, crs_section_tr(lang, title, body)")
    .eq("module_id", moduleUuid)
    .eq("is_deleted", false)
    .order("sort_order");
  if (error) throw error;
  return (data || []).map((s) => {
    const trs = (s.crs_section_tr || []) as Array<{ lang: string; title: string | null; body: string | null }>;
    const pick = (l: string) => trs.find((t) => t.lang === l);
    const en = pick("en"); const bn = pick("bn"); const hi = pick("hi");
    return {
      id: s.id as string,
      module_id: s.module_id as string,
      sort_order: s.sort_order as number,
      title_en: en?.title || "",
      title_bn: bn?.title || en?.title || "",
      title_hi: hi?.title || en?.title || "",
      body_en: en?.body || null,
      body_bn: bn?.body || en?.body || null,
      body_hi: hi?.body || en?.body || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Courses & sections UI
// ---------------------------------------------------------------------------
async function sendCourses(chatId: number, lang: Lang, page: number) {
  const modules = await getModules();
  if (modules.length === 0) {
    await sendMessage(chatId, "No course modules are available yet.");
    return;
  }
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `mod:${m.slug}` }]));
  if (page < totalPages) keyboard.push([{ text: t("next", lang), callback_data: `modpage:${page + 1}` }]);
  if (page > 1)          keyboard.push([{ text: t("prev", lang), callback_data: `modpage:${page - 1}` }]);

  await sendMessage(chatId, `${t("choose_module", lang)}\nPage ${page}/${totalPages}`, { inline_keyboard: keyboard });
}

async function sendModulePicker(chatId: number, _action: "quiz", lang: Lang, page: number) {
  const modules = await getModules();
  if (modules.length === 0) { await sendMessage(chatId, "No modules available for quiz yet."); return; }
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `quizmod:${m.slug}` }]));
  if (page < totalPages) keyboard.push([{ text: t("next", lang), callback_data: `quizpage:${page + 1}` }]);
  if (page > 1)          keyboard.push([{ text: t("prev", lang), callback_data: `quizpage:${page - 1}` }]);

  await sendMessage(chatId, `${t("choose_quiz", lang)}\nPage ${page}/${totalPages}`, { inline_keyboard: keyboard });
}

async function sendSections(chatId: number, moduleSlug: string, lang: Lang) {
  const moduleUuid = await getModuleUuid(moduleSlug);
  if (!moduleUuid) { await sendMessage(chatId, "Module not found."); return; }
  const sections = await getSections(moduleUuid);
  if (sections.length === 0) { await sendMessage(chatId, "No sections available for this module yet."); return; }
  await sendMessage(chatId, "Choose a section:", {
    inline_keyboard: sections.map((s) => ([{
      text: title(s, lang),
      callback_data: `section:${moduleSlug}:${s.id}`,
    }])),
  });
}

async function sendSection(chatId: number, sectionId: string, moduleSlug: string, lang: Lang) {
  const { data, error } = await dbAcharya
    .from("crs_sections")
    .select("id, module_id, crs_section_tr(lang, title, body)")
    .eq("id", sectionId)
    .maybeSingle();
  if (error || !data) { await sendMessage(chatId, "Section not found."); return; }

  const trs = (data.crs_section_tr || []) as Array<{ lang: string; title: string | null; body: string | null }>;
  const pick = (l: string) => trs.find((t) => t.lang === l);
  const en = pick("en"); const bn = pick("bn"); const hi = pick("hi");

  const sectionTitle = (lang === "bn" ? bn?.title : lang === "hi" ? hi?.title : en?.title) || en?.title || "";
  const sectionBody  = (lang === "bn" ? bn?.body  : lang === "hi" ? hi?.body  : en?.body)  || en?.body  || "";

  await sendMessage(chatId, `${sectionTitle}\n\n${sectionBody}`, {
    inline_keyboard: [[{ text: t("mark_complete", lang), callback_data: `done:${moduleSlug}:${sectionId}` }]],
  });
}

async function markSectionComplete(account: TelegramAccount, moduleSlug: string, sectionId: string, acharyaId: string) {
  if (!account.user_id || !moduleSlug || !sectionId) return;
  const moduleUuid = await getModuleUuid(moduleSlug);
  if (!moduleUuid) return;

  const sections = await getSections(moduleUuid);
  const { data: existing } = await dbGunakul
    .from("log_progress")
    .select("sections_completed")
    .eq("user_id", account.user_id)
    .eq("acharya_id", acharyaId)
    .eq("module_id", moduleUuid)
    .maybeSingle();

  const current = Array.isArray((existing as { sections_completed?: unknown } | null)?.sections_completed)
    ? (existing as { sections_completed: string[] }).sections_completed : [];
  const completedSections = Array.from(new Set([...current, sectionId]));
  const completed = sections.length > 0 && completedSections.length >= sections.length;

  await dbGunakul.from("log_progress").upsert(
    {
      user_id: account.user_id,
      acharya_id: acharyaId,
      module_id: moduleUuid,
      sections_completed: completedSections,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_on: new Date().toISOString(),
    },
    { onConflict: "user_id,acharya_id,module_id" },
  );
}

// ---------------------------------------------------------------------------
// AI features
// ---------------------------------------------------------------------------
async function handleAskMessage(chatId: number, account: TelegramAccount, text: string, acharyaId: string, voice?: TelegramMessage["voice"]) {
  if (!account.user_id) return;
  await sendMessage(chatId, t("thinking", account.preferred_lang));
  const started = Date.now();
  const history = await getChatHistory(account.user_id, account.selected_module_id, account.preferred_lang, acharyaId);
  const reply = await generateChatReply({
    message: text || "[voice note]",
    history,
    moduleId: account.selected_module_id,
    lang: account.preferred_lang,
  });
  const moduleUuid = await getModuleUuid(account.selected_module_id);
  await dbGunakul.from("log_chat").insert({
    user_id: account.user_id,
    acharya_id: acharyaId,
    module_id: moduleUuid,
    lang: account.preferred_lang,
    user_message: text || "[voice note]",
    ai_response: reply,
    response_time_ms: Date.now() - started,
  });
  await sendMessage(chatId, reply, persistentMainMenu(account.preferred_lang));
  void voice; // voice transcription not implemented — text fallback used
}

async function getChatHistory(userId: string, moduleSlug: string, lang: Lang, acharyaId: string) {
  const moduleUuid = await getModuleUuid(moduleSlug);
  let query = dbGunakul
    .from("log_chat")
    .select("user_message, ai_response")
    .eq("user_id", userId)
    .eq("acharya_id", acharyaId)
    .eq("lang", lang)
    .order("created_at", { ascending: false })
    .limit(4);
  if (moduleUuid) query = query.eq("module_id", moduleUuid);
  const { data } = await query;
  return (data || []).reverse().flatMap((row: { user_message: string; ai_response: string }) => ([
    { role: "user" as const, content: row.user_message },
    { role: "assistant" as const, content: row.ai_response },
  ]));
}

async function handleApplyMessage(chatId: number, account: TelegramAccount, message: TelegramMessage, acharyaId: string) {
  if (!account.user_id) return;
  const text = (message.text || message.caption || "").trim();
  const photo = message.photo?.slice().sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  const fileId = photo?.file_id || message.voice?.file_id;
  const image = fileId ? await getFileAsDataUrl(fileId).catch(() => null) : null;
  if (!text && !image) return;

  await sendMessage(chatId, t("reviewing", account.preferred_lang));
  const evaluation = await evaluateApply({
    text,
    moduleId: account.selected_module_id,
    lang: account.preferred_lang,
    hasPhoto: !!photo,
    image,
  });
  const moduleUuid = await getModuleUuid(account.selected_module_id);
  await dbGunakul.from("log_apply").insert({
    user_id: account.user_id,
    acharya_id: acharyaId,
    module_id: moduleUuid,
    log_type: evaluation.relevant ? "self_assessment" : "irrelevant_submission",
    data: {
      input: text || (photo ? "[photo submitted]" : "[voice submitted]"),
      relevant: evaluation.relevant,
      score: evaluation.relevant ? evaluation.score : null,
      feedback: evaluation.feedback,
      nextStep: evaluation.relevant ? evaluation.nextStep : null,
      hasPhoto: !!photo,
    },
  });
  if (!evaluation.relevant) {
    await sendMessage(chatId, evaluation.feedback, persistentMainMenu(account.preferred_lang));
    return;
  }
  await sendMessage(
    chatId,
    `Score: ${evaluation.score}/10\n\n${evaluation.feedback}\n\nNext: ${evaluation.nextStep}`,
    persistentMainMenu(account.preferred_lang),
  );
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
async function startQuiz(chatId: number, account: TelegramAccount, moduleSlug: string, acharyaId: string) {
  await sendMessage(chatId, "Generating quiz questions...");
  const completedIds = await getCompletedModuleIds(account, acharyaId);
  let questions: QuizQuestion[];
  try {
    questions = await generateQuizQuestions({ moduleId: moduleSlug, lang: account.preferred_lang, completedModuleIds: completedIds });
  } catch (err) {
    console.error("[telegram] quiz generation failed, using fallback:", err);
    questions = fallbackQuizQuestions(moduleSlug, account.preferred_lang);
    await sendMessage(chatId, "AI quiz generation failed. Using practice questions.");
  }
  const state: QuizState = { type: "quiz", moduleId: moduleSlug, questions, index: 0, score: 0, answers: [] };
  await dbGunakul.from("telegram_accounts")
    .update({ state, selected_module_id: moduleSlug, updated_at: new Date().toISOString() })
    .eq("id", account.id);
  await sendQuizQuestion(chatId, state);
}

async function handleQuizAnswer(chatId: number, account: TelegramAccount, answer: number, acharyaId: string) {
  if (!account.user_id || !isQuizState(account.state)) return;
  const state = account.state;
  const current = state.questions[state.index];
  if (!current || answer < 0 || answer > 3) return;
  const correct = answer === current.correct;
  const nextState: QuizState = {
    ...state,
    score: state.score + (correct ? 1 : 0),
    answers: [...state.answers, answer],
    index: state.index + 1,
  };
  await sendMessage(chatId, `${correct ? "Correct." : "Not correct."} ${current.explanation}`);

  if (nextState.index >= nextState.questions.length) {
    const moduleUuid = await getModuleUuid(nextState.moduleId);
    await dbGunakul.from("log_quiz").insert({
      user_id: account.user_id,
      acharya_id: acharyaId,
      module_id: moduleUuid,
      score: nextState.score,
      total: nextState.questions.length,
      questions: nextState.questions,
    });
    await dbGunakul.from("telegram_accounts")
      .update({ state: {}, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    await sendMessage(
      chatId,
      `Quiz complete. Score: ${nextState.score}/${nextState.questions.length}`,
      persistentMainMenu(account.preferred_lang),
    );
  } else {
    await dbGunakul.from("telegram_accounts")
      .update({ state: nextState, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    await sendQuizQuestion(chatId, nextState);
  }
}

async function sendQuizQuestion(chatId: number, state: QuizState) {
  const q = state.questions[state.index];
  if (!q) return;
  await sendMessage(chatId, `Question ${state.index + 1}/${state.questions.length}\n\n${q.q}`, {
    inline_keyboard: q.options.map((option, idx) => ([{ text: option, callback_data: `ans:${idx}` }])),
  });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
async function sendProgress(chatId: number, account: TelegramAccount, acharyaId: string) {
  if (!account.user_id) return;
  const { data: rows } = await dbGunakul
    .from("log_progress")
    .select("module_id, completed, sections_completed")
    .eq("user_id", account.user_id)
    .eq("acharya_id", acharyaId)
    .order("updated_on", { ascending: false });

  const { data: history } = await dbGunakul
    .from("log_chat")
    .select("user_message, created_at")
    .eq("user_id", account.user_id)
    .eq("acharya_id", acharyaId)
    .order("created_at", { ascending: false })
    .limit(5);

  const completedCount = (rows || []).filter((r: { completed: boolean }) => r.completed).length;
  const inProgressCount = (rows || []).filter((r: { completed: boolean }) => !r.completed).length;

  const historyLines = (history || []).map((h: { user_message: string }) =>
    `  ${h.user_message.slice(0, 45)}${h.user_message.length > 45 ? "..." : ""}`,
  );

  await sendMessage(
    chatId,
    `${t("course_progress", account.preferred_lang)}\n\nCompleted: ${completedCount} modules\nIn progress: ${inProgressCount} modules\n\n${t("recent_activity", account.preferred_lang)}:\n${historyLines.join("\n") || t("no_progress", account.preferred_lang)}`,
    persistentMainMenu(account.preferred_lang),
  );
}

async function getCompletedModuleIds(account: TelegramAccount, acharyaId: string): Promise<string[]> {
  if (!account.user_id) return [];
  const { data } = await dbGunakul
    .from("log_progress")
    .select("module_id")
    .eq("user_id", account.user_id)
    .eq("acharya_id", acharyaId)
    .eq("completed", true);
  return (data || []).map((r: { module_id: string }) => r.module_id);
}

async function setAccountMode(accountId: string, mode: "ask" | "apply") {
  await dbGunakul.from("telegram_accounts")
    .update({ mode, state: {}, updated_at: new Date().toISOString() })
    .eq("id", accountId);
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------
async function getVideos(lang: Lang): Promise<VideoRow[]> {
  try {
    const { data, error } = await dbAcharya
      .from("crs_videos")
      .select("id, youtube_id, sort_order, crs_video_tr(lang, title)")
      .eq("is_deleted", false)
      .order("sort_order");
    if (error) {
      console.error("[telegram] getVideos error:", error);
      return [];
    }
    // Deduplicate by youtube_id (DB has duplicate rows from multiple seed runs)
    const seen = new Set<string>();
    return (data || [])
      .filter((v: Record<string, unknown>) => {
        const trs = (v.crs_video_tr || []) as Array<{ lang: string; title: string }>;
        const key = String(v.youtube_id || "");
        if (!key || seen.has(key) || trs.length === 0) return false;
        seen.add(key);
        return true;
      })
      .map((v: Record<string, unknown>) => {
        const trs = (v.crs_video_tr || []) as Array<{ lang: string; title: string }>;
        const picked = trs.find((t) => t.lang === lang) || trs.find((t) => t.lang === "en") || trs[0];
        return {
          id: String(v.id),
          youtube_id: String(v.youtube_id),
          title: picked?.title || "",
          sort_order: Number(v.sort_order || 0),
        };
      });
  } catch (err) {
    console.error("[telegram] getVideos threw:", err);
    return [];
  }
}

async function sendVideos(chatId: number, lang: Lang) {
  const videos = await getVideos(lang);
  if (videos.length === 0) {
    const msg =
      lang === "hi" ? "अभी कोई वीडियो उपलब्ध नहीं है।"
      : lang === "bn" ? "এখনও কোন ভিডিও পাওয়া যায়নি।"
      : "No videos available yet.";
    await sendMessage(chatId, msg, persistentMainMenu(lang));
    return;
  }
  const header =
    lang === "hi" ? "KarmYog Vatika Orientation Videos:"
    : lang === "bn" ? "KarmYog Vatika ওরিয়েন্টেশন ভিডিও:"
    : "KarmYog Vatika Orientation Videos:";
  const lines = videos.map((v, i) =>
    `${i + 1}. ${v.title}\nhttps://www.youtube.com/watch?v=${v.youtube_id}`
  );
  await sendMessage(chatId, `${header}\n\n${lines.join("\n\n")}`, persistentMainMenu(lang));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function isLang(value: unknown): value is Lang {
  return value === "bn" || value === "hi" || value === "en";
}

function isQuizState(value: unknown): value is QuizState {
  const v = value as Partial<QuizState> | null;
  return !!v && v.type === "quiz" && typeof v.moduleId === "string"
    && Array.isArray(v.questions) && typeof v.index === "number"
    && typeof v.score === "number" && Array.isArray(v.answers);
}

function title(item: { title_bn: string; title_hi: string; title_en: string }, lang: Lang) {
  return (lang === "bn" ? item.title_bn : lang === "hi" ? item.title_hi : item.title_en) || item.title_en;
}
