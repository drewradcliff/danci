"use client";

import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type GoogleSignInCardProps = {
  callbackURL: string;
};

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.56-5.17 3.56-8.65Z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.08.73-2.45 1.16-4.08 1.16-3.13 0-5.78-2.12-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
        fill="#34A853"
      />
      <path
        d="M5.27 14.29a7.18 7.18 0 0 1 0-4.58V6.62H1.27a12 12 0 0 0 0 10.76l4-3.09Z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.76c1.76 0 3.33.61 4.56 1.8l3.42-3.43A11.4 11.4 0 0 0 12 0 12 12 0 0 0 1.27 6.62l4 3.09c.95-2.84 3.6-4.95 6.73-4.95Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInCard({ callbackURL }: GoogleSignInCardProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startGoogleSignIn() {
    setError(null);
    setIsPending(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });

      if (result.error) {
        setError(result.error.message || "Unable to start Google sign-in.");
      }
    } catch {
      setError("Unable to start Google sign-in.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <article className="signin-card">
      <p className="signin-kicker signin-kicker-soft">Secure Session</p>
      <h2 className="signin-card-title">Continue With Google</h2>
      <p className="signin-card-copy">
        Sign in to sync your saved words and keep every definition protected.
      </p>

      <Button
        type="button"
        size="lg"
        onClick={startGoogleSignIn}
        disabled={isPending}
        className="signin-google-button mt-8 w-full rounded-xl text-base font-semibold"
      >
        <GoogleGlyph />
        {isPending ? "Connecting..." : "Sign In With Google"}
      </Button>

      {error ? (
        <p className="signin-error" role="alert">
          <AlertCircle className="size-4" />
          {error}
        </p>
      ) : null}
    </article>
  );
}
