import { generateText, jsonSchema, Output } from "ai";
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

function buildSelectionPrompt(
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
    `Return JSON only in the exact shape {"selectedIndex": <number>}.`,
    `Use an integer selectedIndex between 0 and ${definitions.length - 1}.`,
  ].join("\n");
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

  let selectedIndex = 0;
  let usedFallback = true;

  try {
    const aiResponse = await generateText({
      model: "openai/gpt-5-mini",
      output: Output.object({
        schema: jsonSchema<{ selectedIndex: number }>({
          type: "object",
          additionalProperties: false,
          properties: {
            selectedIndex: {
              type: "integer",
              minimum: 0,
              maximum: definitions.length - 1,
            },
          },
          required: ["selectedIndex"],
        }),
      }),
      prompt: buildSelectionPrompt(parsed.context, parsed.word, definitions),
    });

    selectedIndex = aiResponse.output.selectedIndex;
    usedFallback = false;
  } catch {
    usedFallback = true;
  }

  const selectedDefinition = definitions[selectedIndex] ?? definitions[0];

  return NextResponse.json({
    phrase: parsed.phrase,
    context: parsed.context,
    word: parsed.word,
    definition: selectedDefinition,
    meta: {
      definitionsFound: definitions.length,
      selectedIndex,
      usedFallback,
    },
  });
}
