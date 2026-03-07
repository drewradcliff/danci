import { Fraunces, Manrope } from "next/font/google";

import { LogoutButton } from "@/components/auth/logout-button";
import { DefineForm } from "@/components/define-form";

const headlineFont = Fraunces({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-signin-headline",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-signin-body",
});

export default function Home() {
  return (
    <main className={`signin-shell ${headlineFont.variable} ${bodyFont.variable}`}>
      <section className="home-shell">
        <header className="home-topbar">
          <div className="signin-brand">
            <span className="signin-hanzi" aria-hidden="true">
              词
            </span>
            <div>
              <p className="signin-kicker">Danci</p>
              <p className="home-brand-note">Private word desk</p>
            </div>
          </div>
          <LogoutButton />
        </header>
        <DefineForm />
      </section>
    </main>
  );
}
