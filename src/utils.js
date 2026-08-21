export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCountdown(expiresAt, now = Date.now()) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function difficultyLabel(value) {
  const labels = {
    easy: "Початковий",
    low: "Початковий",
    medium: "Середній",
    normal: "Середній",
    hard: "Просунутий",
    high: "Просунутий"
  };
  return labels[String(value).toLowerCase()] || String(value || "Не вказано");
}

export function difficultyTone(value) {
  const normalized = String(value).toLowerCase();
  if (["hard", "high"].includes(normalized)) return "coral";
  if (["medium", "normal"].includes(normalized)) return "blue";
  return "green";
}

export function parseRoute(hash = globalThis.location?.hash || "") {
  const route = hash.replace(/^#\/?/, "").split("?")[0];
  const [name = "", ...params] = route.split("/").filter(Boolean);
  return { name: name || "home", params };
}

export function safeHash(value, fallback = "#/") {
  return /^#\/[a-z0-9/_-]*$/i.test(value || "") ? value : fallback;
}

export function quizCountLabel(count) {
  const value = Math.abs(Number(count));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "тестів";
  if (last === 1) return "тест";
  if (last >= 2 && last <= 4) return "тести";
  return "тестів";
}
