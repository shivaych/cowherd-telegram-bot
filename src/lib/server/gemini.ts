import "server-only";
import { COWHERD_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { logChatCall, logQuizCall } from "./ai-logger";

const MODEL = "gemini-2.5-flash";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface ApplyEvaluation {
  score: number;
  feedback: string;
  nextStep: string;
}

function langName(lang: string): string {
  return lang === "bn" ? "Bengali" : lang === "hi" ? "Hindi" : "English";
}

function textFromGemini(json: unknown): string {
  const j = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
}

function mediaPart(media: string) {
  const match = media.match(/^data:((image|audio|video)\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { inline_data: { mime_type: match[1], data: match[3] } };
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeQuestions(value: unknown): QuizQuestion[] {
  const obj = value as { questions?: unknown };
  const arr = Array.isArray(obj.questions) ? obj.questions : [];
  return arr.slice(0, 5).map((x) => {
    const q = x as Partial<QuizQuestion>;
    return {
      q: String(q.q || ""),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correct: Number.isInteger(q.correct) ? q.correct as number : 0,
      explanation: String(q.explanation || ""),
    };
  }).filter((q) => q.q && q.options.length === 4 && q.correct >= 0 && q.correct <= 3);
}

async function generateContent(body: Record<string, unknown>): Promise<unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : {};
  if (!res.ok) throw new Error(raw.slice(0, 500));
  return json;
}

export async function generateChatReply(opts: {
  message: string;
  history?: ChatMessage[];
  moduleId?: string | null;
  lang: string;
  image?: string | null;
}) {
  const started = Date.now();
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const h of (opts.history || []).slice(-8)) {
    if (h.content.length <= 4000) {
      contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] });
    }
  }

  const parts: Array<{ text: string } | NonNullable<ReturnType<typeof mediaPart>>> = [{ text: opts.message }];
  if (opts.image) {
    const part = mediaPart(opts.image);
    if (part) parts.push(part);
  }

  try {
    const json = await generateContent({
      system_instruction: {
        parts: [{
          text: `${COWHERD_SYSTEM_PROMPT}\n\nThe learner is currently studying module: ${opts.moduleId || "general cattle and horse care"}.\nRespond in ${langName(opts.lang)}.`,
        }],
      },
      contents: [...contents, { role: "user", parts }],
      generationConfig: { temperature: 0.45, maxOutputTokens: 900 },
    });
    const reply = textFromGemini(json) || "I could not generate a reply. Please try again.";
    logChatCall({ model: MODEL, status: "ok", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId || undefined, hasImage: !!opts.image });
    return reply;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logChatCall({ model: MODEL, status: "error", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId || undefined, hasImage: !!opts.image, errorMessage });
    throw err;
  }
}

export async function generateQuizQuestions(opts: {
  moduleId: string;
  lang: string;
  completedModuleIds?: string[];
}) {
  const started = Date.now();
  const completedIds = (opts.completedModuleIds || []).filter((x) => x.length <= 80).slice(0, 40);
  const prompt = `${COWHERD_SYSTEM_PROMPT}

Generate exactly 5 multiple-choice quiz questions for Cowherd Acharya module ${opts.moduleId}.
Language: ${langName(opts.lang)}.
Completed modules for context: ${completedIds.join(", ") || "none"}.

Return ONLY valid JSON in this exact shape:
{"questions":[{"q":"question","options":["A","B","C","D"],"correct":0,"explanation":"short explanation"}]}

Question topics should be practical cattle and horse care: feeding, milking, disease prevention, vaccination, calf care, stable management, grooming, signs of illness, and safety around large animals.`;

  try {
    const json = await generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1400, responseMimeType: "application/json" },
    });
    const text = textFromGemini(json);
    const questions = normalizeQuestions(extractJson(text));
    if (questions.length !== 5) throw new Error("Gemini returned invalid quiz JSON");
    logQuizCall({ model: MODEL, status: "ok", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId });
    return questions;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logQuizCall({ model: MODEL, status: "error", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId, errorMessage });
    throw err;
  }
}

export function fallbackQuizQuestions(moduleId: string, lang: string): QuizQuestion[] {
  const hi = lang === "hi";
  const bn = lang === "bn";
  const suffix = moduleId ? ` (${moduleId})` : "";
  if (hi) {
    return [
      { q: `गाय को प्रतिदिन कितना पानी देना चाहिए${suffix}?`, options: ["30-40 लीटर", "5-10 लीटर", "15-20 लीटर", "50-60 लीटर"], correct: 0, explanation: "दूध देने वाली गाय को गर्मियों में 30-40 लीटर पानी प्रतिदिन चाहिए।" },
      { q: "FMD वैक्सीन कितने महीने में दोबारा देनी चाहिए?", options: ["6 महीने", "12 महीने", "3 महीने", "2 साल"], correct: 0, explanation: "FMD (खुरपका-मुंहपका) टीका हर 6 महीने में लगाना जरूरी है।" },
      { q: "दूध निकालने से पहले क्या करना चाहिए?", options: ["थनों को गर्म पानी से धोएं", "सीधे दूध निकालें", "गाय को खाना दें", "बछड़े को अलग करें"], correct: 0, explanation: "थनों को गर्म साफ पानी से धोने से मैस्टाइटिस का खतरा कम होता है।" },
      { q: "नवजात बछड़े को खीस (कोलोस्ट्रम) कितने घंटे में देना चाहिए?", options: ["1 घंटे के अंदर", "6 घंटे बाद", "24 घंटे बाद", "3 दिन बाद"], correct: 0, explanation: "खीस में रोग प्रतिरोधक तत्व होते हैं, इसे जन्म के 1 घंटे के अंदर देना जरूरी है।" },
      { q: "घोड़े को खाना खिलाने के कितनी देर बाद व्यायाम कराना चाहिए?", options: ["1 घंटे बाद", "तुरंत", "10 मिनट बाद", "5 घंटे बाद"], correct: 0, explanation: "खाने के तुरंत बाद व्यायाम कराने से कोलिक हो सकता है — कम से कम 1 घंटे रुकें।" },
    ];
  }
  if (bn) {
    return [
      { q: `গাভীকে প্রতিদিন কত লিটার পানি দিতে হবে${suffix}?`, options: ["৩০-৪০ লিটার", "৫-১০ লিটার", "১৫-২০ লিটার", "৫০-৬০ লিটার"], correct: 0, explanation: "দুধালো গাভীর গরমে প্রতিদিন ৩০-৪০ লিটার পানি দরকার।" },
      { q: "FMD টিকা কত মাস পরপর দিতে হয়?", options: ["৬ মাস", "১২ মাস", "৩ মাস", "২ বছর"], correct: 0, explanation: "FMD (ক্ষুরা রোগ) টিকা প্রতি ৬ মাসে দেওয়া আবশ্যক।" },
      { q: "দুধ দোহানোর আগে কী করতে হবে?", options: ["ওলান গরম পানিতে ধুতে হবে", "সরাসরি দোহাতে হবে", "গাভীকে খাবার দিতে হবে", "বাছুরকে আলাদা করতে হবে"], correct: 0, explanation: "ওলান পরিষ্কার গরম পানিতে ধুলে ম্যাস্টাইটিসের ঝুঁকি কমে।" },
      { q: "নবজাতক বাছুরকে শাল দুধ কত ঘণ্টার মধ্যে দিতে হবে?", options: ["১ ঘণ্টার মধ্যে", "৬ ঘণ্টা পরে", "২৪ ঘণ্টা পরে", "৩ দিন পরে"], correct: 0, explanation: "শাল দুধে রোগ প্রতিরোধী উপাদান থাকে — জন্মের ১ ঘণ্টার মধ্যে দেওয়া জরুরি।" },
      { q: "ঘোড়াকে খাওয়ানোর কতক্ষণ পরে ব্যায়াম করাতে হবে?", options: ["১ ঘণ্টা পরে", "সাথে সাথে", "১০ মিনিট পরে", "৫ ঘণ্টা পরে"], correct: 0, explanation: "খাবার পরপরই ব্যায়াম করালে কোলিক হতে পারে — কমপক্ষে ১ ঘণ্টা অপেক্ষা করুন।" },
    ];
  }
  return [
    { q: `How much water should a milking cow receive daily${suffix}?`, options: ["30-40 litres", "5-10 litres", "15-20 litres", "50-60 litres"], correct: 0, explanation: "A milking cow needs 30-40 litres of clean water per day, more in summer." },
    { q: "How often should FMD vaccine be given?", options: ["Every 6 months", "Every year", "Every 3 months", "Every 2 years"], correct: 0, explanation: "FMD (Foot and Mouth Disease) vaccine must be given every 6 months." },
    { q: "What should you do before milking?", options: ["Wash udder with warm clean water", "Milk directly", "Feed the cow first", "Separate the calf"], correct: 0, explanation: "Washing the udder with warm clean water before milking prevents mastitis." },
    { q: "When should colostrum be given to a newborn calf?", options: ["Within 1 hour of birth", "6 hours after birth", "24 hours after birth", "3 days after birth"], correct: 0, explanation: "Colostrum contains antibodies — it must be given within 1 hour of birth." },
    { q: "How long after feeding should you wait before exercising a horse?", options: ["1 hour", "Immediately", "10 minutes", "5 hours"], correct: 0, explanation: "Exercising a horse immediately after feeding can cause colic — always wait at least 1 hour." },
  ];
}

export async function evaluateApply(opts: {
  text: string;
  moduleId: string;
  lang: string;
  hasPhoto?: boolean;
  image?: string | null;
}): Promise<ApplyEvaluation> {
  const prompt = `FIELD APPLICATION EVALUATION.

The learner has reported field work for module ${opts.moduleId} (cattle and horse care).
Report:
${opts.text || "(no text provided)"}

Photo attached: ${opts.hasPhoto ? "yes" : "no"}.

Respond ONLY in valid JSON:
{"score":7,"feedback":"short practical feedback in plain text","nextStep":"one concrete next step"}

Score must be 0 to 10. Respond in ${langName(opts.lang)}.`;

  const reply = await generateChatReply({ message: prompt, moduleId: opts.moduleId, lang: opts.lang, image: opts.image || null });

  try {
    const parsed = extractJson(reply) as Partial<ApplyEvaluation>;
    return {
      score: Math.max(0, Math.min(10, Number(parsed.score || 0))),
      feedback: String(parsed.feedback || reply).slice(0, 4000),
      nextStep: String(parsed.nextStep || "Continue practising and observe the animals carefully.").slice(0, 1000),
    };
  } catch {
    return {
      score: 7,
      feedback: reply.slice(0, 4000),
      nextStep: "Continue practising and observe the animals carefully.",
    };
  }
}
