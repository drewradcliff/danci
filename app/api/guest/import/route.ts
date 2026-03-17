import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { flashcard, lookupHistory } from "@/db/schema";
import { getServerSession } from "@/lib/session";
import { normalizeTerm } from "@/lib/history";

type SessionWithUserId = {
  user?: {
    id?: string;
  };
};

type GuestHistoryRecord = {
  id?: unknown;
  phraseInput?: unknown;
  targetText?: unknown;
  contextText?: unknown;
  createdAt?: unknown;
  result?: {
    structured?: {
      word?: unknown;
      meaning?: unknown;
      examples?: unknown;
    } | null;
    fallbackText?: unknown;
    word?: unknown;
    definition?: {
      meaning?: unknown;
      examples?: unknown;
    } | null;
    resultPreview?: unknown;
  } | null;
};

type GuestFlashcardRecord = {
  id?: unknown;
  term?: unknown;
  lookupHistoryId?: unknown;
  createdAt?: unknown;
};

type ImportRequestBody = {
  history?: unknown;
  flashcards?: unknown;
};

type NormalizedHistoryRecord = {
  guestId: string;
  phraseInput: string;
  targetText: string;
  contextText: string;
  createdAt: Date;
  resultJson: {
    structured: {
      word: string;
      meaning: string;
      examples: string[];
    } | null;
    fallbackText: string | null;
    word: string | null;
    definition: {
      meaning: string;
      examples: string[];
    } | null;
    meta: {
      definitionsFound: number;
      dictionaryLookupFailed: boolean;
      dictionaryErrorCode: null;
      usedFallback: boolean;
      jsonParseFailed: boolean;
    };
  };
};

type NormalizedFlashcardRecord = {
  guestId: string;
  term: string;
  lookupHistoryId: string | null;
  createdAt: Date;
};

function getSessionUserId(session: unknown): string | null {
  const userId = (session as SessionWithUserId | null)?.user?.id;
  return typeof userId === "string" && userId.trim() ? userId : null;
}

function errorResponse(status: number, code: string, message: string) {
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

function normalizeExamples(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
}

function normalizeHistoryRecord(value: unknown) {
  const record = value as GuestHistoryRecord;
  const phraseInput =
    typeof record?.phraseInput === "string" ? record.phraseInput.trim() : "";
  const targetText =
    typeof record?.targetText === "string" ? record.targetText.trim() : "";
  const contextText =
    typeof record?.contextText === "string" ? record.contextText.trim() : "";

  if (!phraseInput || !targetText || !contextText) {
    return null;
  }

  const createdAt =
    typeof record?.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt))
      ? new Date(record.createdAt)
      : new Date();

  const structuredRecord = record?.result?.structured;
  const structured =
    structuredRecord &&
    typeof structuredRecord.word === "string" &&
    typeof structuredRecord.meaning === "string"
      ? {
          word: structuredRecord.word.trim(),
          meaning: structuredRecord.meaning.trim(),
          examples: normalizeExamples(structuredRecord.examples),
        }
      : null;

  const definitionRecord = record?.result?.definition;
  const definition =
    definitionRecord && typeof definitionRecord.meaning === "string"
      ? {
          meaning: definitionRecord.meaning.trim(),
          examples: normalizeExamples(definitionRecord.examples),
        }
      : null;

  const fallbackText =
    typeof record?.result?.fallbackText === "string"
      ? record.result.fallbackText.trim() || null
      : null;
  const word =
    typeof record?.result?.word === "string" ? record.result.word.trim() || null : null;

  return {
    guestId: typeof record?.id === "string" ? record.id : crypto.randomUUID(),
    phraseInput,
    targetText,
    contextText,
    createdAt,
    resultJson: {
      structured,
      fallbackText,
      word,
      definition,
      meta: {
        definitionsFound: definition ? 1 : 0,
        dictionaryLookupFailed: false,
        dictionaryErrorCode: null,
        usedFallback: structured === null,
        jsonParseFailed: structured === null,
      },
    },
  };
}

function normalizeFlashcardRecord(value: unknown) {
  const record = value as GuestFlashcardRecord;
  const term = typeof record?.term === "string" ? record.term.trim() : "";

  if (!term) {
    return null;
  }

  const createdAt =
    typeof record?.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt))
      ? new Date(record.createdAt)
      : new Date();

  return {
    guestId: typeof record?.id === "string" ? record.id : crypto.randomUUID(),
    term,
    lookupHistoryId:
      typeof record?.lookupHistoryId === "string" ? record.lookupHistoryId : null,
    createdAt,
  };
}

function isNormalizedHistoryRecord(
  value: ReturnType<typeof normalizeHistoryRecord>,
): value is NormalizedHistoryRecord {
  return value !== null;
}

function isNormalizedFlashcardRecord(
  value: ReturnType<typeof normalizeFlashcardRecord>,
): value is NormalizedFlashcardRecord {
  return value !== null;
}

export async function POST(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  if (!userId) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication required.");
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be JSON.");
  }

  const historyRecords = Array.isArray(body.history)
    ? body.history.map(normalizeHistoryRecord).filter(isNormalizedHistoryRecord)
    : [];
  const flashcardRecords = Array.isArray(body.flashcards)
    ? body.flashcards.map(normalizeFlashcardRecord).filter(isNormalizedFlashcardRecord)
    : [];

  const guestHistoryById = new Map(historyRecords.map((item) => [item.guestId, item]));
  const normalizedFlashcards = flashcardRecords.filter(
    (item, index, all) =>
      all.findIndex((entry) => normalizeTerm(entry.term) === normalizeTerm(item.term)) === index,
  );

  const insertedHistory: {
    guestId: string;
    databaseId: string;
  }[] = [];

  for (const item of historyRecords) {
    const databaseId = crypto.randomUUID();
    await db.insert(lookupHistory).values({
      id: databaseId,
      userId,
      phraseInput: item.phraseInput,
      targetText: item.targetText,
      contextText: item.contextText,
      resultJson: item.resultJson,
      createdAt: item.createdAt,
    });

    insertedHistory.push({
      guestId: item.guestId,
      databaseId,
    });
  }

  const existingNormalizedTerms = normalizedFlashcards.length
    ? await db
        .select({
          normalizedTerm: flashcard.normalizedTerm,
        })
        .from(flashcard)
        .where(
          and(
            eq(flashcard.userId, userId),
            inArray(
              flashcard.normalizedTerm,
              normalizedFlashcards.map((item) => normalizeTerm(item.term)),
            ),
          ),
        )
    : [];

  const existingSet = new Set(existingNormalizedTerms.map((item) => item.normalizedTerm));
  const historyIdMap = new Map(insertedHistory.map((item) => [item.guestId, item.databaseId]));

  let importedFlashcardCount = 0;
  let skippedFlashcardCount = 0;

  for (const card of normalizedFlashcards) {
    const normalizedTerm = normalizeTerm(card.term);
    if (!normalizedTerm || existingSet.has(normalizedTerm)) {
      skippedFlashcardCount += 1;
      continue;
    }

    const linkedHistory =
      (card.lookupHistoryId && historyIdMap.get(card.lookupHistoryId)) ||
      (() => {
        const matchingHistory = Array.from(guestHistoryById.values()).find(
          (item) => normalizeTerm(item.targetText) === normalizedTerm,
        );
        return matchingHistory ? historyIdMap.get(matchingHistory.guestId) ?? null : null;
      })();

    await db.insert(flashcard).values({
      id: crypto.randomUUID(),
      userId,
      lookupHistoryId: linkedHistory,
      term: card.term,
      normalizedTerm,
      createdAt: card.createdAt,
      updatedAt: card.createdAt,
    });

    existingSet.add(normalizedTerm);
    importedFlashcardCount += 1;
  }

  return NextResponse.json({
    importedHistoryCount: insertedHistory.length,
    importedFlashcardCount,
    skippedFlashcardCount,
  });
}
