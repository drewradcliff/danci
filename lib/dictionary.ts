export type DictionaryDefinition = {
  meaning: string;
  examples: string[];
};

export class DictionaryError extends Error {
  constructor(
    readonly code: "WORD_NOT_FOUND" | "DICTIONARY_UPSTREAM_ERROR",
    message: string
  ) {
    super(message);
    this.name = "DictionaryError";
  }
}

function normalizeExamples(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectDefinitions(input: unknown): DictionaryDefinition[] {
  const definitions: DictionaryDefinition[] = [];
  const seen = new Set<string>();

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const entry of node) {
        walk(entry);
      }
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    const meaning =
      typeof record.definition === "string"
        ? record.definition
        : typeof record.meaning === "string"
          ? record.meaning
          : null;

    if (meaning) {
      const normalizedMeaning = meaning.trim();
      if (normalizedMeaning && !seen.has(normalizedMeaning)) {
        seen.add(normalizedMeaning);
        definitions.push({
          meaning: normalizedMeaning,
          examples: normalizeExamples(record.examples ?? record.example),
        });
      }
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value) || (value && typeof value === "object")) {
        walk(value);
      }
    }
  }

  walk(input);
  return definitions;
}

export async function getDictionaryDefinitions(
  word: string
): Promise<DictionaryDefinition[]> {
  const urls = [
    `https://freedictionaryapi.com/en/${encodeURIComponent(word)}`,
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  ];

  let sawNotFound = false;

  for (const url of urls) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        cache: "no-store",
      });
    } catch {
      continue;
    }

    if (response.status === 404) {
      sawNotFound = true;
      continue;
    }

    if (!response.ok) {
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      continue;
    }

    const definitions = collectDefinitions(payload);
    if (definitions.length > 0) {
      return definitions;
    }
  }

  if (sawNotFound) {
    throw new DictionaryError("WORD_NOT_FOUND", "No dictionary entry found.");
  }

  throw new DictionaryError(
    "DICTIONARY_UPSTREAM_ERROR",
    "Dictionary service could not be reached."
  );
}
