import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildUnauthorizedJson,
  getServerSession,
  sanitizeCallbackURL,
} from "@/lib/session";

const PUBLIC_FILE_REGEX =
  /\.(?:avif|css|eot|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webmanifest|webp|woff|woff2|xml)$/i;

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    PUBLIC_FILE_REGEX.test(pathname)
  );
}

function isAuthHandlerPath(pathname: string) {
  return pathname.startsWith("/api/auth");
}

function isDefinePath(pathname: string) {
  return pathname === "/api/define";
}

function isSignInPath(pathname: string) {
  return pathname === "/sign-in";
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    isPublicPath(pathname) ||
    isAuthHandlerPath(pathname) ||
    isSignInPath(pathname) ||
    isDefinePath(pathname) ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  const session = await getServerSession(request.headers);

  if (isSignInPath(pathname)) {
    if (!session) {
      return NextResponse.next();
    }

    const callbackURL = sanitizeCallbackURL(
      request.nextUrl.searchParams.get("callbackURL"),
    );
    return NextResponse.redirect(new URL(callbackURL, request.url));
  }

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return buildUnauthorizedJson();
  }

  const signInURL = new URL("/sign-in", request.url);
  const callbackURL = sanitizeCallbackURL(`${pathname}${search}`);
  signInURL.searchParams.set("callbackURL", callbackURL);

  return NextResponse.redirect(signInURL);
}

export const proxyConfig = {
  matcher: ["/:path*"],
};
