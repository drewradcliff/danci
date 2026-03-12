export type HistoryItem = {
  id: string;
  phraseInput: string;
  targetText: string;
  contextText: string;
  resultPreview: string | null;
  createdAt: string;
  flashcard: {
    id: string;
    term: string;
  } | null;
};

export type DefineApiSuccess = {
  phrase: string;
  context: string;
  structured: {
    word: string;
    meaning: string;
    examples: string[];
  } | null;
  fallbackText: string | null;
  word?: string;
  definition?: {
    meaning: string;
    examples: string[];
  };
  meta: {
    definitionsFound: number;
    dictionaryLookupFailed?: boolean;
    dictionaryErrorCode?: string | null;
    usedFallback: boolean;
    jsonParseFailed: boolean;
  };
  historyItem?: HistoryItem;
};

export type DefineApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type HistoryApiSuccess = {
  items: HistoryItem[];
  nextCursor: string | null;
};

export type ToggleFlashcardSuccess = {
  active: boolean;
  alreadyExisted?: boolean;
  flashcardId?: string;
  term?: string;
};

export type FlashcardItem = {
  id: string;
  term: string;
  lookupHistoryId: string | null;
  createdAt: string;
  content: {
    phraseInput: string;
    targetText: string;
    word: string | null;
    structured: {
      word: string;
      meaning: string;
      examples: string[];
    } | null;
    fallbackText: string | null;
    definition: {
      meaning: string;
      examples: string[];
    } | null;
    resultPreview: string | null;
  } | null;
};

export type FlashcardsApiSuccess = {
  items: FlashcardItem[];
};

export type RemoveFlashcardSuccess = {
  removed: boolean;
  flashcardId: string;
};

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
  }
}

function isErrorPayload(value: unknown): value is DefineApiError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "error" in value &&
      value.error &&
      typeof value.error === "object" &&
      "message" in value.error &&
      "code" in value.error,
  );
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  let payload: T | DefineApiError | null = null;
  try {
    payload = (await response.json()) as T | DefineApiError;
  } catch {
    if (!response.ok) {
      throw new ApiClientError("Request failed.", {
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }
  }

  if (!response.ok) {
    const fallbackMessage = "Request failed.";
    throw new ApiClientError(
      isErrorPayload(payload) ? payload.error.message ?? fallbackMessage : fallbackMessage,
      {
        status: response.status,
        code: isErrorPayload(payload) ? payload.error.code : "REQUEST_FAILED",
      },
    );
  }

  return payload as T;
}

export const queryKeys = {
  history: (limit = 20) => ["history", { limit }] as const,
  flashcards: () => ["flashcards"] as const,
};

export async function definePhrase(phrase: string) {
  return requestJson<DefineApiSuccess>("/api/define", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ phrase }),
  });
}

export async function fetchHistory({
  cursor,
  limit = 20,
}: {
  cursor?: string | null;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (cursor) {
    query.set("cursor", cursor);
  }
  query.set("limit", String(limit));

  return requestJson<HistoryApiSuccess>(`/api/history?${query.toString()}`);
}

export async function fetchFlashcards() {
  return requestJson<FlashcardsApiSuccess>("/api/flashcards");
}

export async function addFlashcard(lookupHistoryId: string) {
  return requestJson<ToggleFlashcardSuccess>("/api/flashcards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ lookupHistoryId }),
  });
}

export async function removeFlashcard(flashcardId: string) {
  return requestJson<RemoveFlashcardSuccess>("/api/flashcards", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ flashcardId }),
  });
}
