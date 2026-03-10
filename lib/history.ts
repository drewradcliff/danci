type CursorPayload = {
  createdAt: string;
  id: string;
};

type ResultJsonRecord = {
  structured?: {
    meaning?: unknown;
  } | null;
  fallbackText?: unknown;
  definition?: {
    meaning?: unknown;
  } | null;
};

export function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function encodeHistoryCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeHistoryCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as CursorPayload;

    if (
      typeof parsed?.createdAt !== "string" ||
      typeof parsed?.id !== "string" ||
      !parsed.createdAt ||
      !parsed.id
    ) {
      return null;
    }

    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getHistoryResultPreview(resultJson: unknown): string | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const record = resultJson as ResultJsonRecord;
  const structuredMeaning = record.structured?.meaning;
  if (typeof structuredMeaning === "string" && structuredMeaning.trim()) {
    return structuredMeaning.trim();
  }

  if (typeof record.fallbackText === "string" && record.fallbackText.trim()) {
    return record.fallbackText.trim();
  }

  const definitionMeaning = record.definition?.meaning;
  if (typeof definitionMeaning === "string" && definitionMeaning.trim()) {
    return definitionMeaning.trim();
  }

  return null;
}
