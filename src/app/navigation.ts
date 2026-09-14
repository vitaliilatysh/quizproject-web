import { useEffect, useState } from "react";
import { parseRoute, safeHash, type Route } from "../utils.js";

export function navigate(hash: string): void {
  globalThis.location.hash = safeHash(hash);
}

export function pageTitle(name: string): string {
  const titles: Record<string, string> = {
    quizzes: "Тести",
    login: "Вхід",
    signup: "Реєстрація",
    profile: "Профіль",
    settings: "Налаштування",
    results: "Результати",
    attempt: "Проходження тесту",
    admin: "Адміністрування"
  };
  return titles[name] || "Сторінка";
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
