import { normalizeTerm } from "@/lib/history";
import type {
  DefineApiSuccess,
  FlashcardItem,
  HistoryItem,
} from "@/lib/client-api";

const STORAGE_KEY = "danci.guest-store.v1";
const STORAGE_EVENT = "danci:guest-store";

export const GUEST_HISTORY_LIMIT = 10;
export const GUEST_FLASHCARD_LIMIT = 5;

export type GuestHistoryRecord = {
  id: string;
  phraseInput: string;
  targetText: string;
  contextText: string;
  createdAt: string;
  result: {
    structured: DefineApiSuccess["structured"];
    fallbackText: string | null;
    word: string | null;
    definition:
      | {
          meaning: string;
          examples: string[];
        }
      | null;
    resultPreview: string | null;
  };
};

export type GuestFlashcardRecord = {
  id: string;
  term: string;
  lookupHistoryId: string | null;
  createdAt: string;
};

export type GuestStoreData = {
  version: 1;
  history: GuestHistoryRecord[];
  flashcards: GuestFlashcardRecord[];
};

function createEmptyStore(): GuestStoreData {
  return {
    version: 1,
    history: [],
    flashcards: [],
  };
}

function parseStore(value: string): GuestStoreData {
  try {
    const parsed = JSON.parse(value) as Partial<GuestStoreData>;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((item): item is GuestHistoryRecord => {
          const record = item as GuestHistoryRecord;
          return Boolean(
            record &&
              typeof record.id === "string" &&
              typeof record.phraseInput === "string" &&
              typeof record.targetText === "string" &&
              typeof record.contextText === "string" &&
              typeof record.createdAt === "string" &&
              record.result &&
              typeof record.result === "object",
          );
        })
      : [];
    const flashcards = Array.isArray(parsed.flashcards)
      ? parsed.flashcards.filter((item): item is GuestFlashcardRecord => {
          const record = item as GuestFlashcardRecord;
          return Boolean(
            record &&
              typeof record.id === "string" &&
              typeof record.term === "string" &&
              typeof record.createdAt === "string" &&
              (record.lookupHistoryId === null || typeof record.lookupHistoryId === "string"),
          );
        })
      : [];

    return {
      version: 1,
      history,
      flashcards,
    };
  } catch {
    return createEmptyStore();
  }
}

export function loadGuestStore(): GuestStoreData {
  if (typeof window === "undefined") {
    return createEmptyStore();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyStore();
  }

  return parseStore(raw);
}

export function saveGuestStore(store: GuestStoreData) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function clearGuestStore() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function guestStoreHasContent(store: GuestStoreData) {
  return store.history.length > 0 || store.flashcards.length > 0;
}

export function subscribeGuestStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => {
    onStoreChange();
  };

  window.addEventListener(STORAGE_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(STORAGE_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getGuestStoreSnapshot() {
  return loadGuestStore();
}

export function buildGuestHistoryRecord(payload: DefineApiSuccess): GuestHistoryRecord {
  return {
    id: crypto.randomUUID(),
    phraseInput: payload.phrase,
    targetText: payload.word ?? payload.structured?.word ?? "",
    contextText: payload.context,
    createdAt: new Date().toISOString(),
    result: {
      structured: payload.structured,
      fallbackText: payload.fallbackText,
      word: payload.word ?? payload.structured?.word ?? null,
      definition: payload.definition ?? null,
      resultPreview:
        payload.structured?.meaning ??
        payload.fallbackText ??
        payload.definition?.meaning ??
        null,
    },
  };
}

export function addGuestHistoryRecord(
  store: GuestStoreData,
  record: GuestHistoryRecord,
): GuestStoreData {
  const nextHistory = [record, ...store.history.filter((item) => item.id !== record.id)].slice(
    0,
    GUEST_HISTORY_LIMIT,
  );
  const visibleIds = new Set(nextHistory.map((item) => item.id));

  return {
    ...store,
    history: nextHistory,
    flashcards: store.flashcards.filter(
      (card) => card.lookupHistoryId === null || visibleIds.has(card.lookupHistoryId),
    ),
  };
}

export function toHistoryItems(store: GuestStoreData): HistoryItem[] {
  const flashcardByHistoryId = new Map(
    store.flashcards
      .filter((card) => card.lookupHistoryId)
      .map((card) => [card.lookupHistoryId!, { id: card.id, term: card.term }]),
  );

  return store.history.map((item) => ({
    id: item.id,
    phraseInput: item.phraseInput,
    targetText: item.targetText,
    contextText: item.contextText,
    resultPreview: item.result.resultPreview,
    createdAt: item.createdAt,
    flashcard: flashcardByHistoryId.get(item.id) ?? null,
  }));
}

export function toFlashcardItems(store: GuestStoreData): FlashcardItem[] {
  const historyById = new Map(store.history.map((item) => [item.id, item]));

  return store.flashcards.map((card) => {
    const history = card.lookupHistoryId ? historyById.get(card.lookupHistoryId) ?? null : null;

    return {
      id: card.id,
      term: card.term,
      lookupHistoryId: card.lookupHistoryId,
      createdAt: card.createdAt,
      content: history
        ? {
            phraseInput: history.phraseInput,
            targetText: history.targetText,
            word: history.result.word,
            structured: history.result.structured,
            fallbackText: history.result.fallbackText,
            definition: history.result.definition ?? null,
            resultPreview: history.result.resultPreview,
          }
        : null,
    };
  });
}

export function addGuestFlashcard(
  store: GuestStoreData,
  lookupHistoryId: string,
):
  | {
      ok: true;
      store: GuestStoreData;
      flashcard: GuestFlashcardRecord;
    }
  | {
      ok: false;
      reason: "LIMIT_REACHED" | "NOT_FOUND";
    } {
  const historyRecord = store.history.find((item) => item.id === lookupHistoryId);
  if (!historyRecord) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const normalizedTerm = normalizeTerm(historyRecord.targetText);
  const existing = store.flashcards.find(
    (item) => normalizeTerm(item.term) === normalizedTerm,
  );

  if (existing) {
    return {
      ok: true,
      store,
      flashcard: existing,
    };
  }

  if (store.flashcards.length >= GUEST_FLASHCARD_LIMIT) {
    return { ok: false, reason: "LIMIT_REACHED" };
  }

  const flashcard: GuestFlashcardRecord = {
    id: crypto.randomUUID(),
    term: historyRecord.targetText,
    lookupHistoryId,
    createdAt: new Date().toISOString(),
  };

  return {
    ok: true,
    flashcard,
    store: {
      ...store,
      flashcards: [flashcard, ...store.flashcards],
    },
  };
}

export function removeGuestFlashcard(
  store: GuestStoreData,
  flashcardId: string,
): GuestStoreData {
  return {
    ...store,
    flashcards: store.flashcards.filter((item) => item.id !== flashcardId),
  };
}

export function deleteGuestHistory(
  store: GuestStoreData,
  historyId: string,
): {
  store: GuestStoreData;
  removedFlashcardIds: string[];
} {
  const removedFlashcardIds = store.flashcards
    .filter((item) => item.lookupHistoryId === historyId)
    .map((item) => item.id);

  return {
    removedFlashcardIds,
    store: {
      ...store,
      history: store.history.filter((item) => item.id !== historyId),
      flashcards: store.flashcards.filter((item) => item.lookupHistoryId !== historyId),
    },
  };
}

export function normalizeGuestImportPayload(store: GuestStoreData): GuestStoreData {
  const historyIds = new Set(store.history.map((item) => item.id));

  return {
    version: 1,
    history: store.history.filter((item) => Boolean(item.targetText.trim())),
    flashcards: store.flashcards.filter(
      (item) =>
        Boolean(item.term.trim()) &&
        (item.lookupHistoryId === null || historyIds.has(item.lookupHistoryId)),
    ),
  };
}
