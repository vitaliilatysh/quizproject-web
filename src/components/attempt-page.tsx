import { useEffect, useState } from "react";
import { serverNow } from "../clock.js";
import type { Attempt, AttemptCompletion } from "../types.js";
import { formatCountdown, hasExpired } from "../utils.js";

function Countdown({ expiresAt, now }: { readonly expiresAt: string; readonly now: number }) {
  const urgent = new Date(expiresAt).getTime() - now < 5 * 60_000;
  return <strong className={urgent ? "is-urgent" : ""}>{formatCountdown(expiresAt, now)}</strong>;
}

export interface AttemptPageProps {
  attempt: Attempt | undefined;
  loading: boolean;
  error: string | undefined;
  selected: ReadonlySet<number>;
  completion: AttemptCompletion | undefined;
  busy: boolean;
  onRetry?: (() => void) | undefined;
  onToggle: (attemptId: number, answerId: number, checked: boolean) => void;
  onComplete: (attemptId: number) => void;
}

function completionMessage(score: number): string {
  if (score >= 80) return "Відмінна робота! Продовжуйте в тому ж темпі.";
  if (score >= 60) return "Гарний результат. Ще трохи практики — і буде відмінно.";
  return "Це хороший старт. Перегляньте тему й спробуйте ще раз.";
}

export function AttemptPage({
  attempt,
  loading,
  error,
  selected,
  completion,
  busy,
  onRetry,
  onToggle,
  onComplete
}: Readonly<AttemptPageProps>) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!attempt || attempt.completed || completion) return undefined;
    const refresh = () => setNow(serverNow());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [attempt, completion]);

  if (loading && !attempt)
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Тест</p>
        <h1>Готуємо запитання…</h1>
        <div className="result-skeleton" />
      </section>
    );
  if (error)
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Тест</p>
        <h1>Спроба недоступна</h1>
        <div className="empty-state">
          <p>{error}</p>
          <div className="button-row">
            {onRetry && (
              <button className="button button--dark" type="button" onClick={onRetry} disabled={loading}>
                Спробувати ще раз
              </button>
            )}
            <a className="button button--ghost" href="#/quizzes">
              До каталогу
            </a>
          </div>
        </div>
      </section>
    );
  if (!attempt)
    return (
      <section className="section-pad content-page">
        <h1>Завантаження…</h1>
      </section>
    );
  if (completion || attempt.completed) {
    const score = completion?.score ?? attempt.score ?? 0;
    return (
      <section className="completion section-pad">
        <div className="completion__mark">✓</div>
        <p className="eyebrow">Тест завершено</p>
        <h1>Ваш результат</h1>
        <div className="completion__score">
          <strong>{score}</strong>
          <span>%</span>
        </div>
        <p>{completionMessage(score)}</p>
        <div className="button-row">
          <a className="button button--dark" href="#/results">
            Історія результатів
          </a>
          <a className="button button--ghost" href="#/quizzes">
            Інші тести
          </a>
        </div>
      </section>
    );
  }
  const expired = hasExpired(attempt.expiresAt, now);
  const locked = busy || expired;
  return (
    <>
      <section className="attempt-header section-pad">
        <div>
          <a className="back-link" href="#/quizzes">
            ← Каталог тестів
          </a>
          <p className="eyebrow">Спроба #{attempt.attemptId}</p>
          <h1>Тест #{attempt.quizId}</h1>
        </div>
        <div className="timer-card">
          <span>Залишилось часу</span>
          <Countdown expiresAt={attempt.expiresAt} now={now} />
          <small>{busy ? "Надсилаємо відповіді…" : "до автоматичного завершення"}</small>
        </div>
      </section>
      {expired && !busy && (
        <section className="empty-state" role="status">
          <h2>Час вичерпано</h2>
          <p>Час на проходження тесту завершився. Цю спробу вже не можна надіслати.</p>
          <a className="button button--dark" href="#/quizzes">
            До каталогу
          </a>
        </section>
      )}
      <section className="attempt-layout section-pad">
        <form
          className="question-list"
          onSubmit={event => {
            event.preventDefault();
            if (!locked) onComplete(attempt.attemptId);
          }}
        >
          {(attempt.questions || []).map((question, index) => (
            <fieldset
              className="question-card"
              id={`question-${question.id}`}
              key={question.id}
              disabled={locked}
            >
              <legend>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {question.text}
              </legend>
              <div className="answer-list">
                {(question.answers || []).map(answer => (
                  <label className="answer-option" key={answer.id}>
                    <input
                      type="checkbox"
                      name="answer"
                      value={answer.id}
                      checked={selected.has(answer.id)}
                      onChange={event => {
                        if (!locked) onToggle(attempt.attemptId, answer.id, event.target.checked);
                      }}
                    />
                    <span className="answer-check" aria-hidden="true" />
                    <span>{answer.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="attempt-submit">
            <div>
              <strong>Готові завершити?</strong>
              <span>Після надсилання змінити відповіді буде неможливо.</span>
            </div>
            <button className="button button--coral button--large" type="submit" disabled={locked}>
              {busy ? "Перевіряємо…" : "Завершити тест"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
        <aside className="attempt-aside">
          <p className="eyebrow">Навігація</p>
          <div className="question-map">
            {(attempt.questions || []).map((question, index) => (
              <button
                key={question.id}
                type="button"
                onClick={() =>
                  document
                    .getElementById(`question-${question.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                {index + 1}
              </button>
            ))}
          </div>
          <p>Можна вибрати кілька варіантів, якщо запитання цього потребує.</p>
        </aside>
      </section>
    </>
  );
}
