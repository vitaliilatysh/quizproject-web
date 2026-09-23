import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import { rememberReturnTo, type Session } from "../../session.js";
import type { Profile, Result } from "../../types.js";

type HandleAuthError = (error: unknown, returnTo: string) => boolean;

export function useAccountData(
  api: QuizApi,
  session: Session | null,
  accessReady: boolean,
  routeName: string,
  activeAccount: RefObject<string | null>,
  handleAuthError: HandleAuthError
) {
  const [results, setResults] = useState<Result[] | null>(null);
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
      resultsRequest.current = true;
      setResultsLoading(true);
      setResultError("");
      try {
        const rows = await api.results();
        if (activeAccount.current !== requestedBy) return;
        setResults(rows);
      } catch (error) {
        if (activeAccount.current !== requestedBy) return;
        if (!handleAuthError(error, "#/results")) setResultError(friendlyError(error));
      } finally {
        resultsRequest.current = false;
        setResultsLoading(false);
      }
    }
  }, [activeAccount, api, handleAuthError, session]);

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
    } else if (accessReady && results === null && !resultsLoading && !resultError) {
      void loadResults();
    }
  }, [accessReady, loadResults, resultError, results, resultsLoading, routeName, session]);

  useEffect(() => {
    if (routeName !== "profile") return;
    if (!session) {
      rememberReturnTo("#/profile");
      navigate("#/login");
    } else if (accessReady && profile === null && !profileLoading && !profileError) {
      void loadProfile();
    }
  }, [accessReady, loadProfile, profile, profileError, profileLoading, routeName, session]);

  const invalidateResults = useCallback(() => setResults(null), []);

  // Both errors, not just both collections. The load effects will not ask
  // again while one is set — `results === null && !resultsLoading &&
  // !resultError` — so an error left behind by the previous reader is not a
  // stale message, it is a screen that never loads. use-attempts and
  // use-admin-questions already clear theirs here; these two did not.
  const reset = useCallback(() => {
    setResults(null);
    setProfile(null);
    setResultError("");
    setProfileError("");
  }, []);

  return {
    results,
    resultsLoading,
    resultError,
    profile,
    profileLoading,
    profileError,
    loadResults,
    loadProfile,
    invalidateResults,
    reset
  };
}
