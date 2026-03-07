import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const FALLBACK_CALLBACK_URL = "/";
const CALLBACK_BASE_ORIGIN = "http://callback.local";

type UnauthorizedPayload = {
  error: {
    code: "UNAUTHORIZED";
    message: string;
  };
};

export async function getServerSession(
  requestHeaders: Headers,
): Promise<typeof auth.$Infer.Session | null> {
  try {
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });

    return session ?? null;
  } catch {
    return null;
  }
}

export function buildUnauthorizedJson() {
  return NextResponse.json<UnauthorizedPayload>(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      },
    },
    { status: 401 },
  );
}

export function sanitizeCallbackURL(value: unknown): string {
  if (typeof value !== "string") {
    return FALLBACK_CALLBACK_URL;
  }

  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return FALLBACK_CALLBACK_URL;
  }

  try {
    const parsed = new URL(candidate, CALLBACK_BASE_ORIGIN);
    if (parsed.origin !== CALLBACK_BASE_ORIGIN) {
      return FALLBACK_CALLBACK_URL;
    }

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (parsed.pathname === "/sign-in") {
      return FALLBACK_CALLBACK_URL;
    }

    return normalized;
  } catch {
    return FALLBACK_CALLBACK_URL;
  }
}
