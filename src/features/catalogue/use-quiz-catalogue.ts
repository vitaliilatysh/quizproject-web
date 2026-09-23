import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import type { CatalogueSummary, PageMeta, Quiz } from "../../types.js";
import { complexityLabels, HOME_TEASER_SIZE } from "../../utils.js";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function useQuizCatalogue(api: QuizApi, routeName: string) {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);
  const [summary, setSummary] = useState<CatalogueSummary | null>(null);
  const requestInFlight = useRef(false);
  const catalogueRoute = routeName === "quizzes";

  const load = useCallback(async (): Promise<void> => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const request = catalogueRoute
        ? api.quizzes({
            search: appliedSearch,
            complexity: complexityLabels(filter),
            page,
            size: PAGE_SIZE
          })
        : api.quizzes({ page: 0, size: HOME_TEASER_SIZE });
      const [{ items, page: loadedPage }, loadedSummary] = await Promise.all([
        request,
        catalogueRoute
          ? Promise.resolve<CatalogueSummary | null>(null)
          : api.catalogueSummary().catch((): CatalogueSummary | null => null)
      ]);
      setQuizzes(items);
      setPageMeta(loadedPage);
      if (!catalogueRoute) setSummary(loadedSummary);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [api, appliedSearch, catalogueRoute, filter, page]);

  useEffect(() => {
    if (["home", "quizzes"].includes(routeName) && quizzes === null && !error) void load();
  }, [error, load, quizzes, routeName]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [appliedSearch, filter]);

  useEffect(() => {
    setQuizzes(null);
    setPageMeta(null);
    setError("");
    setLoading(true);
  }, [appliedSearch, catalogueRoute, filter, page]);

  // The error goes with the quizzes, because the load effect will not run
  // while it is set: `quizzes === null && !error`. This hook is invalidated
  // when the API address changes, which is precisely the moment the previous
  // address's failure stops being true — and leaving it standing meant the
  // catalogue never reloaded against the address the reader had just fixed.
  const invalidate = useCallback(() => {
    setQuizzes(null);
    setError("");
  }, []);

  return {
    quizzes,
    loading,
    error,
    search,
    filter,
    pageMeta,
    summary,
    setSearch,
    setFilter,
    setPage,
    load,
    invalidate
  };
}
