import { LogoutButton } from "@/components/auth/logout-button";
import { DefineForm } from "@/components/define-form";

export default function Home() {
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
