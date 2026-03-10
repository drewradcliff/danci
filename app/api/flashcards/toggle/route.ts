import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { flashcard, lookupHistory } from "@/db/schema";
import { normalizeTerm } from "@/lib/history";
import { buildUnauthorizedJson, getServerSession } from "@/lib/session";

type SessionWithUserId = {
  user?: {
    id?: string;
  };
};

type ToggleBody = {
  lookupHistoryId?: unknown;
  term?: unknown;
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

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "23505";
}

export async function POST(request: Request) {
  const session = await getServerSession(request.headers);
  const userId = getSessionUserId(session);

  if (!session || !userId) {
    return buildUnauthorizedJson();
  }

  let body: ToggleBody;
  try {
    body = (await request.json()) as ToggleBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be JSON.");
  }

  const lookupHistoryId =
    typeof body.lookupHistoryId === "string" ? body.lookupHistoryId.trim() : "";
  const directTerm = typeof body.term === "string" ? body.term.trim() : "";

  if (!lookupHistoryId && !directTerm) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Request must include lookupHistoryId or term.",
    );
  }

  let resolvedTerm = directTerm;
  let resolvedLookupHistoryId: string | null = null;

  if (lookupHistoryId) {
    const lookup = await db
      .select({
        id: lookupHistory.id,
        targetText: lookupHistory.targetText,
      })
      .from(lookupHistory)
      .where(and(eq(lookupHistory.id, lookupHistoryId), eq(lookupHistory.userId, userId)))
      .limit(1);

    const historyRecord = lookup[0] ?? null;
    if (historyRecord) {
      resolvedTerm = historyRecord.targetText;
      resolvedLookupHistoryId = historyRecord.id;
    } else if (!directTerm) {
      return errorResponse(404, "NOT_FOUND", "Lookup history entry not found.");
    }
  }

  const normalizedTerm = normalizeTerm(resolvedTerm);
  if (!normalizedTerm) {
    return errorResponse(400, "INVALID_REQUEST", "Resolved term is empty.");
  }

  const existing = await db
    .select({ id: flashcard.id })
    .from(flashcard)
    .where(
      and(eq(flashcard.userId, userId), eq(flashcard.normalizedTerm, normalizedTerm)),
    )
    .limit(1);

  const existingCard = existing[0] ?? null;
  if (existingCard) {
    await db.delete(flashcard).where(eq(flashcard.id, existingCard.id));
    return NextResponse.json({ active: false });
  }

  const flashcardId = crypto.randomUUID();
  try {
    await db.insert(flashcard).values({
      id: flashcardId,
      userId,
      lookupHistoryId: resolvedLookupHistoryId,
      term: resolvedTerm,
      normalizedTerm,
    });

    return NextResponse.json({ active: true, flashcardId });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const afterInsertRace = await db
        .select({ id: flashcard.id })
        .from(flashcard)
        .where(
          and(eq(flashcard.userId, userId), eq(flashcard.normalizedTerm, normalizedTerm)),
        )
        .limit(1);

      if (afterInsertRace[0]) {
        return NextResponse.json({ active: true, flashcardId: afterInsertRace[0].id });
      }
    }

    console.error("Failed to toggle flashcard", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unable to toggle flashcard.");
  }
}
