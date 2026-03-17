import { generateText, LanguageModel } from "ai";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { lookupHistory } from "@/db/schema";
import {
  DictionaryError,
  getDictionaryDefinitions,
  type DictionaryDefinition,
} from "@/lib/dictionary";
import { getHistoryResultPreview } from "@/lib/history";
import { getServerSession } from "@/lib/session";
import { parseMarkedWord } from "@/lib/parse-marked-word";

type DefineRequestBody = {
  phrase?: unknown;
  targetWord?: unknown;
};

type ErrorPayload = {
  error: {
    code: string;
    message: string;
  };
};

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse<ErrorPayload> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

type StructuredDefinition = {
  word: string;
  meaning: string;
  examples: string[];
};

const DEFINE_SYSTEM_PROMPT =
  "You are selecting the correct meaning of a word from candidate definitions.";

const DEFINE_MODEL: LanguageModel = "google/gemini-2.5-flash-lite";

type HistoryResultJson = {
  structured: StructuredDefinition | null;
  fallbackText: string | null;
  word?: string;
  definition?: {
    meaning: string;
    examples: string[];
  };
  meta: {
    definitionsFound: number;
    dictionaryLookupFailed: boolean;
    dictionaryErrorCode: DictionaryError["code"] | "INTERNAL_ERROR" | null;
    usedFallback: boolean;
    jsonParseFailed: boolean;
  };
};

type SessionWithUserId = {
  user?: {
    id?: string;
  };
};

function hasListPrefix(value: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(value);
}

function normalizeJsonResponse(rawText: string): string {
  const trimmed = rawText.trim();

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function buildStructuredPrompt(
  context: string,
  word: string,
  definitions: DictionaryDefinition[],
): string {
  const candidates =
    definitions.length > 0
      ? definitions
          .map((definition, index) => {
            const examples =
              definition.examples.length > 0
                ? `\nExamples:\n${definition.examples
                    .map((example) => `- ${example}`)
                    .join("\n")}`
                : "";

            return `${index + 1}. ${definition.meaning}${examples}`;
          })
          .join("\n\n")
      : "No dictionary candidates available.";

  return [
    "TASK",
    "Choose the definition that best matches the target word used in the sentence.",
    "",
    "INPUT",
    `Sentence: "${context}"`,
    `Target word: "${word}"`,
    "",
    "Candidate definitions:",
    candidates,
    "",
    "OUTPUT",
    "Return JSON only:",
    '{ "word": "...", "meaning": "...", "examples": ["...", "..."] }',
    "",
    "CONSTRAINTS",
    "- meaning: one short sentence describing the chosen definition.",
    "- examples: 2 short phrases or sentences using the exact target word.",
    "- Examples should reflect similar usage as the sentence context.",
    "- If none of the candidates fit, infer the meaning from context.",
    "- Preserve the original casing of the target word.",
    "- No numbering, bullets, markdown, or extra keys.",
  ].join("\n");
}

function parseStructuredDefinition(
  rawText: string,
): StructuredDefinition | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalizeJsonResponse(rawText));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.word !== "string" || !record.word.trim()) {
    return null;
  }

  if (typeof record.meaning !== "string" || !record.meaning.trim()) {
    return null;
  }

  if (!Array.isArray(record.examples)) {
    return null;
  }

  const examples = record.examples
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (examples.length !== 2) {
    return null;
  }

  if (examples.some(hasListPrefix)) {
    return null;
  }

  return {
    word: record.word.trim(),
    meaning: record.meaning.trim(),
    examples,
  };
}

function buildHistoryRecordId(): string {
  return crypto.randomUUID();
}

function getSessionUserId(session: unknown): string | null {
  const userId = (session as SessionWithUserId | null)?.user?.id;
  return typeof userId === "string" && userId.trim() ? userId : null;
}

function normalizeTargetWord(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

export async function POST(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  let body: DefineRequestBody;
  try {
    body = (await request.json()) as DefineRequestBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be JSON.");
  }

  if (typeof body.phrase !== "string" || body.phrase.trim().length === 0) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Request must include a non-empty phrase string.",
    );
  }

  const normalizedPhrase = body.phrase.trim();
  const parsed = parseMarkedWord(normalizedPhrase);
  const explicitTargetWord = normalizeTargetWord(body.targetWord);
  const targetWord = explicitTargetWord ?? parsed.word;

  let definitions: DictionaryDefinition[] = [];
  let dictionaryErrorCode: DictionaryError["code"] | "INTERNAL_ERROR" | null =
    null;
  try {
    definitions = await getDictionaryDefinitions(targetWord);
  } catch (error) {
    if (error instanceof DictionaryError) {
      dictionaryErrorCode = error.code;
    } else {
      dictionaryErrorCode = "INTERNAL_ERROR";
    }
  }

  let usedFallback = true;
  let jsonParseFailed = false;
  let rawModelOutput: string | null = null;
  let structured: StructuredDefinition | null = null;

  try {
    const aiResponse = await generateText({
      model: DEFINE_MODEL,
      system: DEFINE_SYSTEM_PROMPT,
      prompt: buildStructuredPrompt(parsed.context, targetWord, definitions),
    });

    rawModelOutput = aiResponse.text.trim();
    structured = parseStructuredDefinition(rawModelOutput);
    usedFallback = structured === null;
    jsonParseFailed = structured === null;
  } catch {
    usedFallback = true;
  }

  const selectedDefinition = definitions[0];
  const fallbackText =
    jsonParseFailed && rawModelOutput
      ? rawModelOutput
      : (selectedDefinition?.meaning ??
        `No dictionary match found for "${targetWord}", but it appears in this context: "${parsed.context}".`);

  const responsePayload = {
    phrase: parsed.phrase,
    context: parsed.context,
    structured,
    fallbackText,
    // Compatibility fallback for older rendering paths.
    word: targetWord,
    definition: selectedDefinition,
    meta: {
      definitionsFound: definitions.length,
      dictionaryLookupFailed: dictionaryErrorCode !== null,
      dictionaryErrorCode,
      usedFallback,
      jsonParseFailed,
    },
    storageMode: userId ? "account" : "guest",
  };

  const resultJson: HistoryResultJson = {
    structured: responsePayload.structured,
    fallbackText: responsePayload.fallbackText,
    word: responsePayload.word,
    definition: responsePayload.definition,
    meta: responsePayload.meta,
  };

  let historyItem: {
    id: string;
    phraseInput: string;
    targetText: string;
    contextText: string;
    resultPreview: string | null;
    createdAt: string;
    flashcard: null;
  } | null = null;

  if (userId) {
    try {
      const historyRecordId = buildHistoryRecordId();
      const createdAt = new Date().toISOString();

      await db.insert(lookupHistory).values({
        id: historyRecordId,
        userId,
        phraseInput: responsePayload.phrase,
        targetText: responsePayload.word,
        contextText: responsePayload.context,
        resultJson,
      });

      historyItem = {
        id: historyRecordId,
        phraseInput: responsePayload.phrase,
        targetText: responsePayload.word,
        contextText: responsePayload.context,
        resultPreview: getHistoryResultPreview(resultJson),
        createdAt,
        flashcard: null,
      };
    } catch (error) {
      console.error("Failed to persist lookup history", error);
    }
  }

  return NextResponse.json({
    ...responsePayload,
    historyItem,
  });
}
