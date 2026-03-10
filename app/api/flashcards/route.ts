import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { flashcard, lookupHistory } from "@/db/schema";
import { getHistoryResultPreview } from "@/lib/history";
import { buildUnauthorizedJson, getServerSession } from "@/lib/session";

type SessionWithUserId = {
  user?: {
    id?: string;
  };
};

type AddFlashcardBody = {
  lookupHistoryId?: unknown;
};

type DeleteFlashcardBody = {
  flashcardId?: unknown;
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

export async function GET(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  const cards = await db
    .select({
      id: flashcard.id,
      term: flashcard.term,
      lookupHistoryId: flashcard.lookupHistoryId,
      createdAt: flashcard.createdAt,
    })
    .from(flashcard)
    .where(eq(flashcard.userId, userId))
    .orderBy(desc(flashcard.createdAt), desc(flashcard.id));

  const lookupIds = Array.from(
    new Set(
      cards
        .map((card) => card.lookupHistoryId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const lookups =
    lookupIds.length > 0
      ? await db
          .select({
            id: lookupHistory.id,
            phraseInput: lookupHistory.phraseInput,
            targetText: lookupHistory.targetText,
            resultJson: lookupHistory.resultJson,
          })
          .from(lookupHistory)
          .where(
            and(eq(lookupHistory.userId, userId), inArray(lookupHistory.id, lookupIds)),
          )
      : [];

  const lookupById = new Map(lookups.map((lookup) => [lookup.id, lookup]));

  return NextResponse.json({
    items: cards.map((card) => {
      const lookup =
        typeof card.lookupHistoryId === "string"
          ? lookupById.get(card.lookupHistoryId) ?? null
          : null;
      const resultRecord =
        lookup && lookup.resultJson && typeof lookup.resultJson === "object"
          ? (lookup.resultJson as {
              structured?: {
                word?: unknown;
                meaning?: unknown;
                examples?: unknown;
              } | null;
              fallbackText?: unknown;
              definition?: {
                meaning?: unknown;
                examples?: unknown;
              } | null;
              word?: unknown;
            })
          : null;
      const structured =
        resultRecord?.structured &&
        typeof resultRecord.structured.word === "string" &&
        typeof resultRecord.structured.meaning === "string" &&
        Array.isArray(resultRecord.structured.examples)
          ? {
              word: resultRecord.structured.word,
              meaning: resultRecord.structured.meaning,
              examples: resultRecord.structured.examples.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : null;
      const fallbackText =
        typeof resultRecord?.fallbackText === "string" ? resultRecord.fallbackText : null;
      const definition =
        resultRecord?.definition &&
        typeof resultRecord.definition.meaning === "string" &&
        Array.isArray(resultRecord.definition.examples)
          ? {
              meaning: resultRecord.definition.meaning,
              examples: resultRecord.definition.examples.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : null;
      const wordFromResult =
        typeof resultRecord?.word === "string" ? resultRecord.word : lookup?.targetText ?? null;

      return {
        id: card.id,
        term: card.term,
        lookupHistoryId: card.lookupHistoryId,
        createdAt: card.createdAt.toISOString(),
        content: lookup
          ? {
              phraseInput: lookup.phraseInput,
              targetText: lookup.targetText,
              word: wordFromResult,
              structured,
              fallbackText,
              definition,
              resultPreview: getHistoryResultPreview(lookup.resultJson),
            }
          : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  let body: AddFlashcardBody;
  try {
    body = (await request.json()) as AddFlashcardBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be JSON.");
  }

  const lookupHistoryId =
    typeof body.lookupHistoryId === "string" ? body.lookupHistoryId.trim() : "";
  if (!lookupHistoryId) {
    return errorResponse(400, "INVALID_REQUEST", "lookupHistoryId is required.");
  }

  const lookup = await db
    .select({
      id: lookupHistory.id,
      targetText: lookupHistory.targetText,
    })
    .from(lookupHistory)
    .where(and(eq(lookupHistory.id, lookupHistoryId), eq(lookupHistory.userId, userId)))
    .limit(1);

  const record = lookup[0] ?? null;
  if (!record) {
    return errorResponse(404, "NOT_FOUND", "Lookup history entry not found.");
  }

  const normalizedTerm = record.targetText.trim().replace(/\s+/g, " ").toLowerCase();
  const existing = await db
    .select({
      id: flashcard.id,
      term: flashcard.term,
    })
    .from(flashcard)
    .where(and(eq(flashcard.userId, userId), eq(flashcard.normalizedTerm, normalizedTerm)))
    .limit(1);

  if (existing[0]) {
    return NextResponse.json({
      active: true,
      alreadyExisted: true,
      flashcardId: existing[0].id,
      term: existing[0].term,
    });
  }

  const flashcardId = crypto.randomUUID();
  await db.insert(flashcard).values({
    id: flashcardId,
    userId,
    lookupHistoryId: record.id,
    term: record.targetText,
    normalizedTerm,
  });

  return NextResponse.json({
    active: true,
    alreadyExisted: false,
    flashcardId,
    term: record.targetText,
  });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  let body: DeleteFlashcardBody;
  try {
    body = (await request.json()) as DeleteFlashcardBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be JSON.");
  }

  const flashcardId =
    typeof body.flashcardId === "string" ? body.flashcardId.trim() : "";
  if (!flashcardId) {
    return errorResponse(400, "INVALID_REQUEST", "flashcardId is required.");
  }

  const deleted = await db
    .delete(flashcard)
    .where(and(eq(flashcard.id, flashcardId), eq(flashcard.userId, userId)))
    .returning({ id: flashcard.id });

  if (!deleted[0]) {
    return errorResponse(404, "NOT_FOUND", "Flashcard not found.");
  }

  return NextResponse.json({ removed: true, flashcardId });
}
