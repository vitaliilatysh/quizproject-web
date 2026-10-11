import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import { rememberReturnTo, type Session } from "../../session.js";
import type { Profile, ResultHistory } from "../../types.js";

type HandleAuthError = (error: unknown, returnTo: string) => boolean;

const PAGE_SIZE = 20;

export function useAccountData(
  api: QuizApi,
  session: Session | null,
  accessReady: boolean,
  routeName: string,
  activeAccount: RefObject<string | null>,
  handleAuthError: HandleAuthError
) {
  const [results, setResults] = useState<ResultHistory | null>(null);
  const [resultsPage, setResultsPage] = useState(0);
  // Which page `results` holds. It trails resultsPage while the next page
  // loads, and the difference between the two is what asks for that page.
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const resultsRequest = useRef(false);
  const profileRequest = useRef(false);
  const loadResults = useCallback(async (): Promise<void> => {
    if (session && !resultsRequest.current) {
      const requestedBy = session.username;
      const page = resultsPage;
      resultsRequest.current = true;
      setResultsLoading(true);
      setResultError("");
      try {
        // The totals do not depend on the page, so turning one reuses them.
        const [rows, summary] = await Promise.all([
          api.results({ page, size: PAGE_SIZE }),
          results?.summary ?? api.resultSummary()
        ]);
        if (activeAccount.current !== requestedBy) return;
        // An empty page past the first means the history shrank since the last
        // one arrived: deleting a quiz deletes its attempts. Shown as is, it
        // reads as an empty history with no pager to leave by, under totals that
        // are no longer true. Go to the last page that exists and ask for the
        // totals again. The target is always below this page, so this ends.
        if (page > 0 && rows.items.length === 0) {
          setResults(null);
          setLoadedPage(null);
          setResultsPage(Math.max(0, Math.min(page - 1, (rows.page?.totalPages ?? page) - 1)));
          return;
        }
        setResults({ page: rows, summary });
        setLoadedPage(page);
      } catch (error) {
        if (activeAccount.current !== requestedBy) return;
        if (!handleAuthError(error, "#/results")) setResultError(friendlyError(error));
      } finally {
        resultsRequest.current = false;
        setResultsLoading(false);
      }
    }
  }, [activeAccount, api, handleAuthError, results, resultsPage, session]);

  const loadProfile = useCallback(async (): Promise<void> => {
    if (!session || profileRequest.current) return;
    const requestedBy = session.username;
    profileRequest.current = true;
    setProfileLoading(true);
    setProfileError("");
    try {
      const loaded = await api.profile();
      if (activeAccount.current !== requestedBy) return;
      setProfile(loaded);
    } catch (error) {
      if (activeAccount.current !== requestedBy) return;
      if (!handleAuthError(error, "#/profile")) setProfileError(friendlyError(error));
    } finally {
      profileRequest.current = false;
      setProfileLoading(false);
    }
  }, [activeAccount, api, handleAuthError, session]);

  useEffect(() => {
    if (routeName !== "results") return;
    if (!session) {
      rememberReturnTo("#/results");
      navigate("#/login");
    } else if (accessReady && loadedPage !== resultsPage && !resultsLoading && !resultError) {
      void loadResults();
    }
  }, [accessReady, loadResults, loadedPage, resultError, resultsLoading, resultsPage, routeName, session]);

  useEffect(() => {
    if (routeName !== "profile") return;
    if (!session) {
      rememberReturnTo("#/profile");
      navigate("#/login");
    } else if (accessReady && profile === null && !profileLoading && !profileError) {
      void loadProfile();
    }
  }, [accessReady, loadProfile, profile, profileError, profileLoading, routeName, session]);

  // A completed attempt changes the totals and lands first in the list, which
  // is ordered newest first, so the screen goes back to the page that shows it.
  const invalidateResults = useCallback(() => {
    setResults(null);
    setLoadedPage(null);
    setResultsPage(0);
  }, []);

  // Both errors, not just both collections. The load effects will not ask
  // again while one is set — `loadedPage !== resultsPage && !resultsLoading &&
  // !resultError` — so an error left behind by the previous reader is not a
  // stale message, it is a screen that never loads. use-attempts and
  // use-admin-questions already clear theirs here; these two did not.
  const reset = useCallback(() => {
    setResults(null);
    setLoadedPage(null);
    setResultsPage(0);
    setProfile(null);
    setResultError("");
    setProfileError("");
  }, []);

  return {
    results,
    resultsLoading,
    resultError,
    setResultsPage,
    profile,
    profileLoading,
    profileError,
    loadResults,
    loadProfile,
    invalidateResults,
    reset
  };
}
