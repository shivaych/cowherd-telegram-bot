import "server-only";
import path from "node:path";
import { after } from "next/server";
import { writeLine } from "./logger";
import { dbGunakul, dbConfigured, getAcharyaId } from "./supabase";

export interface AICallLog {
  ts: string;
  service: "chat" | "quiz" | "tts";
  model: string;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  chars?: number;
  lang?: string;
  moduleId?: string;
  hasImage?: boolean;
  costUsd: number;
  errorMessage?: string;
}

const PRICE: Record<string, { input?: number; output?: number; cachedInput?: number; perMChar?: number }> = {
  "gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "google-tts-chirp3-hd": { perMChar: 16.0 },
};

function priceOf(model: string) {
  return PRICE[model] || { input: 0.075, output: 0.30 };
}

export function computeLlmCost(model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number {
  const p = priceOf(model);
  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return ((p.input ?? 0) * uncachedInput + (p.output ?? 0) * outputTokens + ((p.cachedInput ?? 0) * cachedInputTokens)) / 1_000_000;
}

export function computeTtsCost(model: string, chars: number): number {
  return ((priceOf(model).perMChar ?? 0) * chars) / 1_000_000;
}

const LOG_FILE = path.join(process.cwd(), "logs", "ai", "calls.jsonl");

function writeEntry(entry: AICallLog) {
  writeLine(LOG_FILE, JSON.stringify(entry));
  console.log(`[ai] ${entry.service} ${entry.model} ${entry.status} ${entry.durationMs}ms $${entry.costUsd.toFixed(4)}`);

  if (dbConfigured) {
    const buildRow = async () => ({
      ts: entry.ts,
      service: entry.service,
      model: entry.model,
      status: entry.status,
      duration_ms: entry.durationMs,
      input_tokens: entry.inputTokens ?? null,
      output_tokens: entry.outputTokens ?? null,
      cached_input_tokens: entry.cachedInputTokens ?? null,
      chars: entry.chars ?? null,
      lang: entry.lang ?? null,
      acharya_id: await getAcharyaId(),
      has_image: !!entry.hasImage,
      cost_usd: entry.costUsd,
      error_message: entry.errorMessage ?? null,
    });

    try {
      after(async () => {
        try {
          const row = await buildRow();
          await dbGunakul.from("log_ai_usage").insert(row);
        } catch (err) {
          console.error("[ai-logger] supabase insert failed:", err);
        }
      });
    } catch {
      buildRow()
        .then((row) => dbGunakul.from("log_ai_usage").insert(row))
        .catch((err) => console.error("[ai-logger] supabase insert threw:", err));
    }
  }
}

export function logChatCall(opts: {
  model: string; status: "ok" | "error" | "timeout"; durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  lang?: string; moduleId?: string; hasImage?: boolean; errorMessage?: string;
}) {
  const inputTokens = opts.usage?.inputTokens || 0;
  const outputTokens = opts.usage?.outputTokens || 0;
  const cachedInputTokens = opts.usage?.cachedInputTokens || 0;
  writeEntry({
    ts: new Date().toISOString(), service: "chat", model: opts.model, status: opts.status,
    durationMs: opts.durationMs, inputTokens, outputTokens, cachedInputTokens,
    lang: opts.lang, moduleId: opts.moduleId, hasImage: opts.hasImage,
    costUsd: opts.status === "ok" ? computeLlmCost(opts.model, inputTokens, outputTokens, cachedInputTokens) : 0,
    errorMessage: opts.errorMessage,
  });
}

export function logQuizCall(opts: {
  model: string; status: "ok" | "error" | "timeout"; durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  lang?: string; moduleId?: string; errorMessage?: string;
}) {
  const inputTokens = opts.usage?.inputTokens || 0;
  const outputTokens = opts.usage?.outputTokens || 0;
  const cachedInputTokens = opts.usage?.cachedInputTokens || 0;
  writeEntry({
    ts: new Date().toISOString(), service: "quiz", model: opts.model, status: opts.status,
    durationMs: opts.durationMs, inputTokens, outputTokens, cachedInputTokens,
    lang: opts.lang, moduleId: opts.moduleId,
    costUsd: opts.status === "ok" ? computeLlmCost(opts.model, inputTokens, outputTokens, cachedInputTokens) : 0,
    errorMessage: opts.errorMessage,
  });
}
