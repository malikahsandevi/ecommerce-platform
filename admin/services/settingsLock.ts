import { apiClient } from "./api";

// ── Settings Lock (client side) ─────────────────────────────────────
// Entering Settings requires re-verifying your own account password:
// POST /settings/verify-password mints a short-lived (15 min) unlock
// proof, which the api layer then presents on the full Settings reads
// (the X-Settings-Unlock header — see services/api.ts). The proof
// lives in sessionStorage: it survives in-tab navigation and refresh,
// and dies with the tab. The PASSWORD itself is never stored anywhere
// — it exists only inside the verify request / a single save request.
//
// The server is the real enforcer (403 SETTINGS_LOCKED); everything
// here is just the client carrying the proof.

const TOKEN_KEY = "settings-unlock-token";
const EXP_KEY = "settings-unlock-exp";

export function getSettingsUnlockToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(EXP_KEY) || 0);
    if (!token) return null;
    if (exp && Date.now() > exp) {
      clearSettingsUnlock();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function hasSettingsUnlock(): boolean {
  return Boolean(getSettingsUnlockToken());
}

export function clearSettingsUnlock(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXP_KEY);
  } catch {
    /* storage unavailable — the server still enforces expiry */
  }
}

function storeSettingsUnlock(token: string, expiresInSeconds: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(
      EXP_KEY,
      String(Date.now() + Math.max(0, expiresInSeconds - 5) * 1000),
    );
  } catch {
    /* storage unavailable — Settings will simply ask again */
  }
}

/** Re-verifies the caller's own password with the API and stores the
 *  minted unlock proof. Rejects with the API's error on a wrong
 *  password (the lock screen shows its message and stays locked). */
export async function verifySettingsPassword(password: string): Promise<void> {
  const { data } = await apiClient.post<{ unlockToken: string; expiresIn: number }>(
    "/settings/verify-password",
    { password },
  );
  storeSettingsUnlock(data.unlockToken, data.expiresIn || 900);
}

/** True when an API error is the entry lock's refusal (403 +
 *  SETTINGS_LOCKED) — the Settings page turns that into the lock
 *  screen instead of an error toast. */
export function isSettingsLockedError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: { code?: string } };
  };
  return (
    err?.response?.status === 403 &&
    err?.response?.data?.code === "SETTINGS_LOCKED"
  );
}

/** True when an API error is a dead or absent session (401). The auth
 *  layer owns that state — the api interceptor clears the token and
 *  the auth provider surfaces the session-expired notice + login
 *  popup — so settings-area fetches stay silent on 401 instead of
 *  adding an error toast of their own. */
export function isUnauthorizedError(error: unknown): boolean {
  const err = error as { response?: { status?: number } };
  return err?.response?.status === 401;
}
