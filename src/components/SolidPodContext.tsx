import { createContext, ReactNode, useContext, useState, useEffect, useRef, useCallback } from "react";
import { type SessionStateChangeDetail } from "@uvdsl/solid-oidc-client-browser/core";
import { SessionIDB } from "@uvdsl/solid-oidc-client-browser";
import { Capacitor } from "@capacitor/core";
import { ResilientSession, SessionEndedError } from "../services/ResilientSession";
import { solidClientDetails } from "../services/solidClientIdentity";
import { onAppResumed } from "../services/appResume";
import { logAuthEvent } from "../services/authLog";
import { resetPodSessionCaches } from "../services/solidPod";
import { AUTH_RETURN_TO_KEY } from "../pages/solid-pod-handle-redirect-page";
import { isNeutralAuthReturnRoute } from "../pages/postLoginDestination";
import { AppSession } from "../types/AppSession";
import { forgetSignedIn, rememberSignedIn, rememberedWebId } from "../services/rememberedSession";

interface SolidPodContextValue {
  session: AppSession | null;
  /** A live session: the pod is reachable and requests to it will be authorised. */
  isLoggedIn: boolean;
  /**
   * Signed in, but the session is not live — the provider cannot be reached, so
   * the stored refresh token has not been exchanged yet. Almost always: no
   * network. The user has *not* been signed out and nothing has been lost, so
   * the app keeps their identity and their data on screen and goes on retrying.
   * Never true once the provider has ended the grant (see `sessionExpired`).
   */
  isReconnecting: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  /**
   * Who the user is signed in as — from the live session, or, while
   * reconnecting, remembered from the last one. Not proof that a pod request
   * will succeed: check `isLoggedIn` (or `session`) for that.
   */
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

/** Backoff schedule for retrying a session we believe is still restorable. */
const RECOVERY_DELAYS_MS = [1_000, 3_000, 8_000, 20_000, 45_000, 90_000];

/**
 * How long startup waits for a session to come back before rendering anyway.
 * The restore keeps going in the background; this only decides whether the user
 * stares at a spinner while it does.
 */
const STARTUP_RESTORE_BUDGET_MS = 4_000;

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [liveWebId, setLiveWebId] = useState<string | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);
  // Cleared only when the session is genuinely over, so it survives the reloads
  // and cold starts an offline device is full of.
  const [lastWebId, setLastWebId] = useState<string | undefined>(rememberedWebId);

  // A session we could not restore yet but have no reason to believe is dead.
  // While this is set, the app keeps quietly trying rather than showing the user
  // a login prompt for what is usually a few seconds of bad network.
  //
  // The ref is what the retry logic reads (callbacks made once, at construction,
  // cannot see React state); the state is the same fact for rendering. Set them
  // together through `setRecovering`.
  const recoveringRef = useRef(false);
  // Seeded from what the device remembers: a cold start with a remembered
  // identity is reconnecting until proven otherwise, so the first paint after
  // an offline launch shows the user signed in rather than flashing a sign-in
  // button at them. A device with no stored session corrects this within a tick.
  const [isReconnecting, setIsReconnecting] = useState(() => rememberedWebId() !== undefined);
  const recoveryAttemptRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setRecovering = useCallback((recovering: boolean) => {
    recoveringRef.current = recovering;
    setIsReconnecting(recovering);
  }, []);

  // The provider has disowned the grant. Kept in a ref because the session
  // callbacks are built once and cannot read state: it stops the state-change
  // event that follows an expiry from booking a retry for a session that is over.
  const providerEndedRef = useRef(false);
  // `attemptRestore` is defined below and re-created as its deps change; the
  // callbacks reach it through this so they always call the current one.
  const attemptRestoreRef = useRef<((trigger: string) => Promise<boolean>) | undefined>(undefined);

  const uvdslSessionRef = useRef<ResilientSession>(null!);
  if (!uvdslSessionRef.current) {
    // The deployed site and the native app both identify themselves with a hosted
    // Client ID Document, which cannot lapse. Only an origin with no document of
    // its own — localhost, a preview deploy — registers dynamically.
    uvdslSessionRef.current = new ResilientSession(
      solidClientDetails({
        clientIdUrl: import.meta.env.VITE_CLIENT_ID_URL as string | undefined,
        isNativePlatform: Capacitor.isNativePlatform(),
        origin: window.location.origin || "http://localhost",
      }),
      new SessionIDB(),
      {
        onSessionStateChange: (e) => {
          const { isActive, webId: newWebId } = (e as CustomEvent<SessionStateChangeDetail>).detail;
          setIsLoggedIn(isActive);
          setLiveWebId(isActive ? newWebId : undefined);
          if (isActive) {
            setSessionExpired(false);
            providerEndedRef.current = false;
            setRecovering(false);
            recoveryAttemptRef.current = 0;
            if (newWebId) {
              rememberSignedIn(newWebId);
              setLastWebId(newWebId);
            }
            return;
          }
          // A live session went inactive without the provider saying anything —
          // the access token lapsed while the refresh could not get through,
          // which on a phone is just "it woke up with no signal". Nothing else
          // covers this: the recovery backoff only watches a session that was
          // never restored. So claim it here and keep trying.
          if (!providerEndedRef.current && !intentionalLogoutRef.current) {
            setRecovering(true);
            void attemptRestoreRef.current?.("session-inactive");
          }
        },
        // ResilientSession fires this only when the provider has rejected the
        // grant — not for network trouble, which it retries on its own.
        onSessionExpiration: () => {
          providerEndedRef.current = true;
          if (!intentionalLogoutRef.current) setSessionExpired(true);
          setRecovering(false);
          setIsLoggedIn(false);
          setLiveWebId(undefined);
          // The session is actually over, so the device stops claiming an identity.
          forgetSignedIn();
          setLastWebId(undefined);
          intentionalLogoutRef.current = false;
        },
      }
    );
  }

  const uvdslSession = uvdslSessionRef.current;

  // The live session's WebID while there is one; otherwise the remembered one,
  // but only while we still believe that session is coming back.
  const webId = liveWebId ?? (isReconnecting ? lastWebId : undefined);

  const appSession: AppSession | null = isLoggedIn
    ? { fetch: uvdslSession.authFetch.bind(uvdslSession), info: { isLoggedIn, webId } }
    : null;

  /**
   * Tries to restore, and keeps trying on a backoff while the failure looks
   * temporary. Only the provider rejecting the grant stops the attempts — a
   * refresh token that is merely unreachable is not a logged-out user.
   */
  const attemptRestore = useCallback(async (trigger: string): Promise<boolean> => {
    if (uvdslSession.isActive) return true;
    if (!(await uvdslSession.hasStoredSession())) {
      logAuthEvent("restore.no-stored-session", { trigger });
      setRecovering(false);
      // Nothing to come back to — anything remembered about the identity is
      // stale (storage evicted, or a sign-out this tab never saw).
      forgetSignedIn();
      setLastWebId(undefined);
      return false;
    }
    // A stored session that is not live is a signed-in user we cannot reach
    // yet, from this moment rather than only once an attempt has failed.
    setRecovering(true);

    try {
      logAuthEvent("restore.attempt", { trigger, attempt: recoveryAttemptRef.current + 1 });
      await uvdslSession.restore();
      setRecovering(false);
      recoveryAttemptRef.current = 0;
      logAuthEvent("restore.succeeded", { trigger });
      return true;
    } catch (error) {
      if (error instanceof SessionEndedError) {
        logAuthEvent("restore.session-ended", { trigger, reason: error.reason }, "error");
        setRecovering(false);
        return false;
      }
      // Still recoverable. Schedule another go.
      setRecovering(true);
      const attempt = recoveryAttemptRef.current;
      recoveryAttemptRef.current = attempt + 1;
      const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)];
      logAuthEvent("restore.will-retry", { trigger, attempt: attempt + 1, delay }, "warn");

      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = setTimeout(() => { void attemptRestore("backoff"); }, delay);
      return false;
    }
  }, [uvdslSession, setRecovering]);

  // The session callbacks are built once, so they reach the current
  // `attemptRestore` through here rather than closing over a stale one.
  attemptRestoreRef.current = attemptRestore;

  useEffect(() => {
    const initializeSession = async () => {
      try {
        logAuthEvent("init.start");

        const searchParams = new URLSearchParams(window.location.search);
        const isOAuthCallback = searchParams.has("code") || searchParams.has("state");

        if (!isOAuthCallback) {
          sessionStorage.setItem(AUTH_RETURN_TO_KEY, window.location.hash.substring(1) || "/");
        }

        try {
          await uvdslSession.handleRedirectFromLogin();
        } catch (error) {
          // A malformed or stale callback must not cost us the session already
          // stored on this device — fall through and restore it below.
          logAuthEvent("login.redirect-failed", { reason: String(error) }, "warn");
        }

        if (isOAuthCallback && uvdslSession.isActive) {
          // Redirect completed — navigate to the stored return route.
          // We handle this here instead of via pod-auth-callback.html so the
          // redirect_uri registered with the IdP can be the plain SPA root ("/").
          logAuthEvent("login.completed", { webId: uvdslSession.webId });
          uvdslSession.scheduleRenewal();
          const storedReturnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
          let returnTo = storedReturnTo ?? "";
          if (isNeutralAuthReturnRoute(returnTo)) {
            // Nowhere the user asked to come back to — the home page is where
            // they happened to be when they signed in, not a destination. Hand
            // it to the redirect page, which picks between their lists and the
            // wizard once it knows what this identity's pod holds (#334).
            // Clearing the key matters: the reload below re-reads it, and a
            // leftover "/home" would put them straight back where they started.
            sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
            returnTo = "/solid-pod-handle-redirect";
          }
          window.location.replace("/#" + returnTo);
          return;
        }

        if (!uvdslSession.isActive) {
          // Don't hold the first paint hostage to a slow network — the retry
          // continues in the background and signs the user in when it lands.
          await Promise.race([
            attemptRestore("startup"),
            new Promise(resolve => setTimeout(resolve, STARTUP_RESTORE_BUDGET_MS)),
          ]);
        }
      } catch (error) {
        logAuthEvent("init.failed", { reason: String(error) }, "error");
      } finally {
        setIsLoading(false);
      }
    };

    void initializeSession();
    return () => clearTimeout(recoveryTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Take every chance to get a stalled session back: coming online, or the app
  // returning to the foreground, are both good moments to retry ahead of the backoff.
  useEffect(() => {
    const retryIfRecovering = (trigger: string) => {
      if (!recoveringRef.current || uvdslSession.isActive) return;
      clearTimeout(recoveryTimerRef.current);
      void attemptRestore(trigger);
    };

    const onOnline = () => retryIfRecovering("online");
    const stopWatchingResume = onAppResumed(() => retryIfRecovering("resumed"));

    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      stopWatchingResume();
    };
  }, [attemptRestore, uvdslSession]);

  // Coming back to the app is when a token is most likely to have lapsed while
  // the device slept — and on a phone the renewal timer was frozen along with
  // the process, so this is the only thing that notices. Renew before the user's
  // first action needs it.
  useEffect(() => {
    if (!isLoggedIn) return;

    const renewIfNeeded = () => {
      if (!uvdslSession.needsRenewal()) return;
      logAuthEvent("refresh.on-resume");
      void uvdslSession.restore().catch(() => { /* restore() reports and retries */ });
    };

    const stopWatchingResume = onAppResumed(renewIfNeeded);
    window.addEventListener("online", renewIfNeeded);
    return () => {
      stopWatchingResume();
      window.removeEventListener("online", renewIfNeeded);
    };
  }, [isLoggedIn, uvdslSession]);

  // Keep the renewal timer armed for the life of the session.
  useEffect(() => {
    if (!isLoggedIn) {
      uvdslSession.cancelRenewal();
      return;
    }
    uvdslSession.scheduleRenewal();
    return () => uvdslSession.cancelRenewal();
  }, [isLoggedIn, uvdslSession]);

  const login = async (oidcIssuer: string, returnTo?: string) => {
    const currentLocation = returnTo || window.location.hash.substring(1) || "/";
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, currentLocation);
    const redirectUri = (window.location.origin || "http://localhost") + "/";
    logAuthEvent("login.redirecting", { oidcIssuer });
    await uvdslSession.login(oidcIssuer, redirectUri);
  };

  const logout = async () => {
    intentionalLogoutRef.current = true;
    setRecovering(false);
    clearTimeout(recoveryTimerRef.current);
    try {
      await uvdslSession.logout();
    } finally {
      // Leaving this set would swallow the banner for the next genuine expiry.
      intentionalLogoutRef.current = false;
    }
    // Which pod a WebID lives in, and which of its containers exist, are facts
    // about the identity that just went away.
    resetPodSessionCaches();
    // Nothing about the identity outlives a deliberate sign-out: the next start
    // must show a signed-out app, not one waiting to reconnect.
    forgetSignedIn();
    setLastWebId(undefined);
    setIsLoggedIn(false);
    setLiveWebId(undefined);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  const value: SolidPodContextValue = {
    session: appSession,
    isLoggedIn,
    isReconnecting: isReconnecting && !isLoggedIn,
    sessionExpired,
    clearSessionExpired,
    webId,
    isLoading,
    login,
    logout,
  };

  return (
    <SolidPodContext.Provider value={value}>
      {children}
    </SolidPodContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSolidPod() {
  const context = useContext(SolidPodContext);

  if (context === undefined) {
    throw new Error("useSolidPod must be used within a SolidPodProvider");
  }

  return context;
}
