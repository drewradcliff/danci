import { generateText } from "ai";
import { NextResponse } from "next/server";

import {
  DictionaryError,
  getDictionaryDefinitions,
  type DictionaryDefinition,
} from "@/lib/dictionary";
import { MarkedWordParseError, parseMarkedWord } from "@/lib/parse-marked-word";

type DefineRequestBody = {
  phrase?: unknown;
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

function hasListPrefix(value: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(value);
}

function buildStructuredPrompt(
  context: string,
  word: string,
  definitions: DictionaryDefinition[],
): string {
  const candidates = definitions
    .map((definition, index) => {
      const examples =
        definition.examples.length > 0
          ? `\nExamples:\n${definition.examples.map((example) => `- ${example}`).join("\n")}`
          : "";

      return `${index}: ${definition.meaning}${examples}`;
    })
    .join("\n\n");

  return [
    "Pick the dictionary sense that best matches the marked word in context.",
    `Context sentence: "${context}"`,
    `Target word: "${word}"`,
    "",
    "Candidate definitions:",
    candidates,
    "",
    "Return JSON only in this exact shape:",
    '{ "word": "...", "meaning": "...", "examples": ["...", "...", "..."] }',
    "",
    "Rules:",
    "- meaning must be one short sentence.",
    "- examples must contain 2 to 4 short plain-text phrases or sentences.",
    "- examples should use similar usage contexts for the target word.",
    "- Do not include numbering or bullet characters in strings.",
    "- Preserve the original word casing from the target word.",
    "- Do not include markdown or any keys other than word, meaning, examples.",
  ].join("\n");
}

function parseStructuredDefinition(rawText: string): StructuredDefinition | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
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

  if (examples.length < 2 || examples.length > 4) {
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

export async function POST(request: Request) {
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

  let parsed;
  try {
    parsed = parseMarkedWord(normalizedPhrase);
  } catch (error) {
    if (error instanceof MarkedWordParseError) {
      return errorResponse(400, error.code, error.message);
    }

    return errorResponse(500, "INTERNAL_ERROR", "Unexpected parsing failure.");
  }

  let definitions: DictionaryDefinition[];
  try {
    definitions = await getDictionaryDefinitions(parsed.word);
  } catch (error) {
    if (error instanceof DictionaryError) {
      if (error.code === "WORD_NOT_FOUND") {
        return errorResponse(404, error.code, error.message);
      }

      return errorResponse(502, error.code, error.message);
    }

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Unexpected dictionary lookup failure.",
    );
  }

  let usedFallback = true;
  let jsonParseFailed = false;
  let rawModelOutput: string | null = null;
  let structured: StructuredDefinition | null = null;

  try {
    const aiResponse = await generateText({
      model: "openai/gpt-5-mini",
      prompt: buildStructuredPrompt(parsed.context, parsed.word, definitions),
    });

    rawModelOutput = aiResponse.text.trim();
    structured = parseStructuredDefinition(rawModelOutput);
    usedFallback = structured === null;
    jsonParseFailed = structured === null;
  } catch {
    usedFallback = true;
  }

  const selectedDefinition = definitions[0];
  const fallbackText = jsonParseFailed ? rawModelOutput : null;

  return NextResponse.json({
    phrase: parsed.phrase,
    context: parsed.context,
    structured,
    fallbackText,
    // Compatibility fallback for older rendering paths.
    word: parsed.word,
    definition: selectedDefinition,
    meta: {
      definitionsFound: definitions.length,
      usedFallback,
      jsonParseFailed,
    },
  });
}
