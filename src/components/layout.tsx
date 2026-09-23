import type { ReactNode } from "react";
import type { Session } from "../session.js";
import type { Route } from "../utils.js";

/** One transient message in the corner. Owned by App, rendered by Layout. */
export interface Toast {
  id: string;
  message: string;
  tone: string;
}

function activeRoute(name: string, route: Route): string {
  if (name === "quizzes" && ["quizzes", "attempt"].includes(route.name)) return "is-active";
  return route.name === name ? "is-active" : "";
}

export interface LayoutProps {
  route: Route;
  session: Session | null;
  onLogout: () => void;
  toasts: Toast[];
  children: ReactNode;
}

export function Layout({ route, session, onLogout, toasts, children }: Readonly<LayoutProps>) {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Quiz Project — головна">
          <span className="brand-mark" aria-hidden="true">
            <span>Q</span>
          </span>
          <span>Quiz Project</span>
        </a>
        <nav className="main-nav" aria-label="Основна навігація">
          <a className={activeRoute("home", route)} href="#/">
            Огляд
          </a>
          <a className={activeRoute("quizzes", route)} href="#/quizzes">
            Тести
          </a>
          <a className={activeRoute("results", route)} href="#/results">
            Мої результати
          </a>
          {session?.roles?.includes("ROLE_ADMIN") && (
            <a className={activeRoute("admin", route)} href="#/admin">
              Адміністрування
            </a>
          )}
        </nav>
        <div className="header-actions">
          <a
            className={`icon-button ${activeRoute("settings", route)}`}
            href="#/settings"
            aria-label="Налаштування API"
          >
            ⚙
          </a>
          {session ? (
            <>
              <a
                className={`account-chip ${activeRoute("profile", route)}`}
                href="#/profile"
                title="Відкрити профіль"
              >
                <span className="avatar">{session.username.slice(0, 1).toUpperCase()}</span>
                <span className="account-name">{session.username}</span>
              </a>
              <button className="button button--ghost button--small" type="button" onClick={onLogout}>
                Вийти
              </button>
            </>
          ) : (
            <>
              <a className="button button--ghost button--small signup-link" href="#/signup">
                Реєстрація
              </a>
              <a className="button button--dark button--small" href="#/login">
                Увійти
              </a>
            </>
          )}
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div>
          <span className="brand brand--footer">
            <span className="brand-mark" aria-hidden="true">
              <span>Q</span>
            </span>
            <span>Quiz Project</span>
          </span>
          <p>Окремий React frontend для REST API — без JSP, JSTL і Bootstrap.</p>
        </div>
        <div className="footer-links">
          <a href="#/quizzes">Каталог тестів</a>
          <a href="#/settings">Підключення API</a>
          <a href="https://github.com/vitaliilatysh/quizproject" target="_blank" rel="noreferrer">
            Backend ↗
          </a>
        </div>
      </footer>

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
