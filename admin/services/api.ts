import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export const apiClient = axios.create({
  // Set NEXT_PUBLIC_API_URL in .env.local (see .env.example) when the
  // backend is deployed; defaults to the local backend.
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  // The serverless backend can take a while on a cold start (function boot +
  // Atlas connect), so allow generous time before giving up.
  timeout: 45000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Settings Lock: the full Settings reads require the short-lived
    // unlock proof minted by POST /settings/verify-password (see
    // services/settingsLock.ts, which owns the storage keys). Present
    // it on every request the server gates with that proof — the
    // /settings reads AND the Deleted Items list (/trash), which sits
    // behind the same entry gate. The server enforces it; an
    // absent/expired proof simply earns a 403 SETTINGS_LOCKED.
    const requestUrl = config.url || '';
    if (requestUrl.includes('/settings') || requestUrl.includes('/trash')) {
      try {
        const unlock = sessionStorage.getItem('settings-unlock-token');
        const exp = Number(sessionStorage.getItem('settings-unlock-exp') || 0);
        if (unlock && (!exp || Date.now() <= exp)) {
          config.headers['X-Settings-Unlock'] = unlock;
        }
      } catch {
        /* storage unavailable — the request goes without the proof */
      }
    }
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retryCount?: number };

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_GET_RETRIES = 2;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // A 401 with a stored session means the token died — clear it and let
    // the auth provider surface the "session expired" notice + login popup.
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      if (localStorage.getItem('adminToken')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.dispatchEvent(new Event('admin:session-expired'));
      }
      throw error;
    }

    // A 403 SETTINGS_LOCKED means the Settings unlock proof is gone or
    // expired (15 minutes). Drop the stored proof and broadcast it —
    // the Settings page answers with its lock screen, so no caller
    // should surface this refusal as an error toast of its own. (The
    // verify-password refusal carries no such code and never lands
    // here.)
    if (
      error.response?.status === 403 &&
      (error.response.data as { code?: string } | undefined)?.code ===
        'SETTINGS_LOCKED' &&
      typeof window !== 'undefined'
    ) {
      try {
        sessionStorage.removeItem('settings-unlock-token');
        sessionStorage.removeItem('settings-unlock-exp');
      } catch {
        /* storage unavailable — the server still enforces expiry */
      }
      window.dispatchEvent(new Event('admin:settings-locked'));
      throw error;
    }

    // Cold starts on the free serverless tier occasionally drop the first
    // request or answer 502/503/504. GETs are idempotent, so retry them a
    // couple of times with backoff instead of failing the page.
    const isNetworkError = !error.response;
    const isRetryableStatus = error.response
      ? RETRYABLE_STATUSES.has(error.response.status)
      : false;

    if (
      config &&
      (config.method || 'get').toLowerCase() === 'get' &&
      (isNetworkError || isRetryableStatus) &&
      (config._retryCount || 0) < MAX_GET_RETRIES
    ) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = 1200 * config._retryCount;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(config);
    }

    throw error;
  }
);

// The toast rule's client-side safety net (Ahsan: "toast me details
// na do, sirf main point do"). The backend already translates its
// errors into short human sentences (utils/apiError there); this
// guard exists so a technical-shaped message can NEVER reach a
// toast even if one slips through — a stale deployment, a proxy's
// own error page, a library's raw wording. Validation-shaped text
// becomes the exact short sentence for missing fields; any other
// technical shape becomes the generic main point. Clean human
// sentences pass through byte-identical.
const VALIDATION_SHAPED = /Path\s+`|validation failed/i;
const TECHNICAL_SHAPED = [
  /Cast to\s/i, // "Cast to ObjectId failed for value …"
  /E11000/, // raw duplicate-key driver text
  /duplicate key error/i,
  /Mongo(Server|Network|Parse|WriteConcern|Topology)?Error/,
  /BSON(Type)?Error/,
  /Request failed with status code/i, // axios's own wording
  /\n\s*at\s+[\w$.<>]+\s*\(/, // a stack-trace frame
  /^\s*\{"/, // a JSON dump standing in for a message
];

export function sanitizeApiMessage(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) {
    return 'Something went wrong. Please try again.';
  }
  if (VALIDATION_SHAPED.test(message)) {
    return 'Please fill all required fields.';
  }
  if (TECHNICAL_SHAPED.some((pattern) => pattern.test(message))) {
    return 'Something went wrong. Please try again.';
  }
  return message;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractApiError(error: any): string {
  if (error?.code === 'ECONNABORTED') {
    return 'The server took too long to respond. It may be waking up — please try again.';
  }
  if (error.response && error.response.data && error.response.data.message) {
    return sanitizeApiMessage(error.response.data.message);
  }
  if (!error.response && error.message) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return sanitizeApiMessage(error.message);
}
