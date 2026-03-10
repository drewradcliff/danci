import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GoogleSignInCard } from "@/components/auth/google-sign-in-card";
import { getServerSession, sanitizeCallbackURL } from "@/lib/session";

type SignInPageProps = {
  searchParams: Promise<{
    callbackURL?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackURL = sanitizeCallbackURL(params.callbackURL);
  const headerStore = await headers();
  const session = await getServerSession(new Headers(headerStore));

  if (session) {
    redirect(callbackURL);
  }

  return (
    <main className="signin-shell">
      <section className="signin-grid">
        <div className="signin-intro">
          <div className="signin-brand">
            <span className="signin-hanzi" aria-hidden="true">
              词
            </span>
            <p className="signin-kicker">Dāncí</p>
          </div>
          <h1 className="signin-title">Contextual Dictionary</h1>
          <p className="signin-subtitle">
            A soft little workspace for collecting meanings and examples. Sign in once
            to unlock your private word garden.
          </p>
        </div>

        <GoogleSignInCard callbackURL={callbackURL} />
      </section>
    </main>
  );
}
