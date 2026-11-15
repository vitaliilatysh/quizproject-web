import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogueApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import type { CatalogueSummary, PageMeta, Quiz } from "../../types.js";
import { complexityLabels, HOME_TEASER_SIZE } from "../../utils.js";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface CatalogueState {
  key: string;
  quizzes: Quiz[] | null;
  loading: boolean;
  error: string;
  pageMeta: PageMeta | null;
  summary: CatalogueSummary | null;
}

const EMPTY: CatalogueState = {
  key: "",
  quizzes: null,
  loading: true,
  error: "",
  pageMeta: null,
  summary: null
};

type CatalogueSource = Pick<CatalogueApi, "baseUrl" | "quizzes" | "catalogueSummary">;

export function useQuizCatalogue(api: CatalogueSource, routeName: string) {
  const [state, setState] = useState(EMPTY);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef<{ key: string; id: number } | null>(null);
  const mounted = useRef(true);
  const catalogueRoute = routeName === "quizzes";
  // Token rotation replaces the client, but does not change a public query.
  const key = JSON.stringify([api.baseUrl, catalogueRoute ? [appliedSearch, filter, page] : null, revision]);
  const current = state.key === key ? state : EMPTY;
  const active = routeName === "home" || catalogueRoute;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!mounted.current || inFlight.current?.key === key) return;
    const id = ++generation.current;
    inFlight.current = { key, id };
    setState({ ...EMPTY, key });
    try {
      const request = catalogueRoute
        ? api.quizzes({ search: appliedSearch, complexity: complexityLabels(filter), page, size: PAGE_SIZE })
        : api.quizzes({ page: 0, size: HOME_TEASER_SIZE });
      const [{ items, page: pageMeta }, summary] = await Promise.all([
        request,
        catalogueRoute
          ? Promise.resolve<CatalogueSummary | null>(null)
          : api.catalogueSummary().catch((): CatalogueSummary | null => null)
      ]);
      if (mounted.current && generation.current === id) {
        setState({ key, quizzes: items, pageMeta, summary, loading: false, error: "" });
      }
    } catch (reason) {
      if (mounted.current && generation.current === id) {
        setState({ ...EMPTY, key, loading: false, error: friendlyError(reason) });
      }
    } finally {
      if (inFlight.current?.id === id) inFlight.current = null;
    }
  }, [api, appliedSearch, catalogueRoute, filter, key, page]);

  useEffect(() => {
    if (active && state.key !== key) void load();
  }, [active, key, load, state.key]);

  useEffect(() => {
    if (search === appliedSearch) return undefined;
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [appliedSearch, search]);

  const changeFilter = useCallback(
    (value: string) => {
      if (value === filter) return;
      setFilter(value);
      setPage(0);
    },
    [filter]
  );

  const invalidate = useCallback(() => {
    generation.current += 1;
    inFlight.current = null;
    setRevision(value => value + 1);
  }, []);

  return {
    quizzes: current.quizzes,
    loading: current.loading,
    error: current.error,
    pageMeta: current.pageMeta,
    summary: current.summary,
    search,
    filter,
    setSearch,
    setFilter: changeFilter,
    setPage,
    load,
    invalidate
  };
}
