import Link from "next/link";
import { headers } from "next/headers";

import { LogoutButton } from "@/components/auth/logout-button";
import { DefineForm } from "@/components/define-form";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/session";

export default async function Home() {
  const headerStore = await headers();
  const session = await getServerSession(new Headers(headerStore));
  const isSignedIn = Boolean(session?.user?.id);

  return (
    <main className="signin-shell">
      <section className="home-shell">
        <header className="home-topbar">
          <div className="signin-brand">
            <span className="signin-hanzi" aria-hidden="true">
              词
            </span>
            <div>
              <p className="signin-kicker">Danci</p>
              <p className="home-brand-note">
                {isSignedIn ? "Synced word desk" : "Saved on this device"}
              </p>
            </div>
          </div>

          {isSignedIn ? (
            <LogoutButton />
          ) : (
            <Button asChild size="sm" className="rounded-xl px-4">
              <Link href="/sign-in?callbackURL=/">Sign In To Sync</Link>
            </Button>
          )}
        </header>

        <DefineForm isSignedIn={isSignedIn} />
      </section>
    </main>
  );
}
