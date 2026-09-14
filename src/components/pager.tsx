import type { PageMeta } from "../types.js";

export interface PagerProps {
  meta: PageMeta | null;
  onChange: (page: number) => void;
  busy: boolean;
  label: string;
}

export function Pager({ meta, onChange, busy, label }: PagerProps) {
  if (!meta || meta.totalPages <= 1) return null;
  const first = meta.number * meta.size + 1;
  const last = Math.min(first + meta.size - 1, meta.totalCount);
  return (
    <div className="pager">
      <button
        className="button button--ghost button--small"
        type="button"
        disabled={busy || meta.number <= 0}
        onClick={() => onChange(meta.number - 1)}
      >Назад</button>
      <span className="pager__status">{label} {first}–{last} з {meta.totalCount}</span>
      <button
        className="button button--ghost button--small"
        type="button"
        disabled={busy || meta.number >= meta.totalPages - 1}
        onClick={() => onChange(meta.number + 1)}
      >Далі</button>
    </div>
  );
}
