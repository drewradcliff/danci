import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { flashcard, lookupHistory } from "@/db/schema";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  getHistoryResultPreview,
  normalizeTerm,
} from "@/lib/history";
import { buildUnauthorizedJson, getServerSession } from "@/lib/session";

type SessionWithUserId = {
  user?: {
    id?: string;
  };
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

function parseLimit(value: string | null): number | null {
  if (value === null) {
    return 20;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 50);
}

export async function GET(request: Request) {
  const session = await getServerSession(new Headers(request.headers));
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) {
    return errorResponse(400, "INVALID_REQUEST", "Invalid limit query parameter.");
  }

  const cursor = url.searchParams.get("cursor");
  const decodedCursor = cursor ? decodeHistoryCursor(cursor) : null;
  if (cursor && !decodedCursor) {
    return errorResponse(400, "INVALID_REQUEST", "Invalid cursor query parameter.");
  }

  const cursorDate = decodedCursor ? new Date(decodedCursor.createdAt) : null;
  const whereClause = decodedCursor
    ? and(
        eq(lookupHistory.userId, userId),
        or(
          lt(lookupHistory.createdAt, cursorDate!),
          and(eq(lookupHistory.createdAt, cursorDate!), lt(lookupHistory.id, decodedCursor.id)),
        ),
      )
    : eq(lookupHistory.userId, userId);

  const rows = await db
    .select({
      id: lookupHistory.id,
      phraseInput: lookupHistory.phraseInput,
      targetText: lookupHistory.targetText,
      contextText: lookupHistory.contextText,
      resultJson: lookupHistory.resultJson,
      createdAt: lookupHistory.createdAt,
    })
    .from(lookupHistory)
    .where(whereClause)
    .orderBy(desc(lookupHistory.createdAt), desc(lookupHistory.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  const normalizedTargets = Array.from(
    new Set(
      visibleRows
        .map((row) => normalizeTerm(row.targetText))
        .filter((value) => value.length > 0),
    ),
  );

  const flashcards =
    normalizedTargets.length > 0
      ? await db
          .select({
            id: flashcard.id,
            term: flashcard.term,
            normalizedTerm: flashcard.normalizedTerm,
          })
          .from(flashcard)
          .where(
            and(eq(flashcard.userId, userId), inArray(flashcard.normalizedTerm, normalizedTargets)),
          )
      : [];

  const flashcardByNormalizedTerm = new Map(
    flashcards.map((entry) => [entry.normalizedTerm, { id: entry.id, term: entry.term }]),
  );

  const items = visibleRows.map((row) => {
    const normalizedTerm = normalizeTerm(row.targetText);
    return {
      id: row.id,
      phraseInput: row.phraseInput,
      targetText: row.targetText,
      contextText: row.contextText,
      resultPreview: getHistoryResultPreview(row.resultJson),
      createdAt: row.createdAt.toISOString(),
      flashcard: flashcardByNormalizedTerm.get(normalizedTerm) ?? null,
    };
  });

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeHistoryCursor({
          createdAt: last.createdAt,
          id: last.id,
        })
      : null;

  return NextResponse.json({ items, nextCursor });
}

type DeleteHistoryRequest = {
  historyId?: unknown;
};

export async function DELETE(request: Request) {
  const session = await getServerSession(new Headers(request.headers));
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  let body: DeleteHistoryRequest;
  try {
    body = (await request.json()) as DeleteHistoryRequest;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Invalid JSON body.");
  }

  const historyId = typeof body.historyId === "string" ? body.historyId.trim() : "";
  if (!historyId) {
    return errorResponse(400, "INVALID_REQUEST", "historyId is required.");
  }

  const deleted = await db
    .delete(lookupHistory)
    .where(and(eq(lookupHistory.id, historyId), eq(lookupHistory.userId, userId)))
    .returning({ id: lookupHistory.id });

  if (deleted.length === 0) {
    return errorResponse(404, "NOT_FOUND", "History entry not found.");
  }

  return NextResponse.json({ removed: true, historyId });
}
