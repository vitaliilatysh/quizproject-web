import { useEffect, useState } from "react";
import { serverNow } from "../clock.js";
import type { Attempt, AttemptCompletion } from "../types.js";
import { formatCountdown } from "../utils.js";

function Countdown({ expiresAt }: { readonly expiresAt: string }) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);
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
  onToggle: (attemptId: number, answerId: number, checked: boolean) => void;
  onComplete: (attemptId: number) => void;
}

function completionMessage(score: number): string {
  if (score >= 80) return "Відмінна робота! Продовжуйте в тому ж темпі.";
  if (score >= 60) return "Гарний результат. Ще трохи практики — і буде відмінно.";
  return "Це хороший старт. Перегляньте тему й спробуйте ще раз.";
}

export function AttemptPage({ attempt, loading, error, selected, completion, busy, onToggle, onComplete }: Readonly<AttemptPageProps>) {
  if (loading && !attempt) return <section className="section-pad content-page"><p className="eyebrow">Тест</p><h1>Готуємо запитання…</h1><div className="result-skeleton" /></section>;
  if (error) return <section className="section-pad content-page"><p className="eyebrow">Тест</p><h1>Спроба недоступна</h1><div className="empty-state"><p>{error}</p><a className="button button--dark" href="#/quizzes">До каталогу</a></div></section>;
  if (!attempt) return <section className="section-pad content-page"><h1>Завантаження…</h1></section>;
  if (completion || attempt.completed) {
    const score = completion?.score ?? attempt.score ?? 0;
    return (
      <section className="completion section-pad">
        <div className="completion__mark">✓</div><p className="eyebrow">Тест завершено</p><h1>Ваш результат</h1>
        <div className="completion__score"><strong>{score}</strong><span>%</span></div>
        <p>{completionMessage(score)}</p>
        <div className="button-row"><a className="button button--dark" href="#/results">Історія результатів</a><a className="button button--ghost" href="#/quizzes">Інші тести</a></div>
      </section>
    );
  }
  return (
    <>
      <section className="attempt-header section-pad">
        <div><a className="back-link" href="#/quizzes">← Каталог тестів</a><p className="eyebrow">Спроба #{attempt.attemptId}</p><h1>Тест #{attempt.quizId}</h1></div>
        <div className="timer-card"><span>Залишилось часу</span><Countdown expiresAt={attempt.expiresAt} /><small>до автоматичного завершення</small></div>
      </section>
      <section className="attempt-layout section-pad">
        <form className="question-list" onSubmit={event => { event.preventDefault(); onComplete(attempt.attemptId); }}>
          {(attempt.questions || []).map((question, index) => (
            <fieldset className="question-card" id={`question-${question.id}`} key={question.id}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.text}</legend>
              <div className="answer-list">
                {(question.answers || []).map(answer => (
                  <label className="answer-option" key={answer.id}>
                    <input type="checkbox" name="answer" value={answer.id} checked={selected.has(answer.id)} onChange={event => onToggle(attempt.attemptId, answer.id, event.target.checked)} />
                    <span className="answer-check" aria-hidden="true" /><span>{answer.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="attempt-submit"><div><strong>Готові завершити?</strong><span>Після надсилання змінити відповіді буде неможливо.</span></div><button className="button button--coral button--large" type="submit" disabled={busy}>{busy ? "Перевіряємо…" : "Завершити тест"} <span aria-hidden="true">→</span></button></div>
        </form>
        <aside className="attempt-aside"><p className="eyebrow">Навігація</p><div className="question-map">{(attempt.questions || []).map((question, index) => <button key={question.id} type="button" onClick={() => document.getElementById(`question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{index + 1}</button>)}</div><p>Можна вибрати кілька варіантів, якщо запитання цього потребує.</p></aside>
      </section>
    </>
  );
}
