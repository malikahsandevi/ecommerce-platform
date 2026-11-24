"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from './api';
import { readDeviceLanguage, translate } from './i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AuthContext = createContext<any>(null);

export const useAdminAuth = () => useContext(AuthContext);

/** module → action → allowed, as returned by the API (login payload / GET /permissions/me). */
export type PermissionMatrix = Record<string, Record<string, boolean>>;

export interface AdminUser {
  id?: string;
  name: string;
  email?: string;
  role: string;
  avatar?: string;
  permissions?: PermissionMatrix;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function describeAuthError(error: any): string {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.code === 'ECONNABORTED' || !error?.response) {
    return 'Could not reach the server. It may be waking up — please try again.';
  }
  return error?.message || 'Authentication failed. Please try again.';
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const clearNotice = useCallback(() => setSessionNotice(null), []);

  const logout = useCallback(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // Wake the serverless backend (function boot + database connect) as soon
  // as the panel opens, so the first real request after login is not the
  // one paying the cold-start cost. Fire-and-forget against a public route.
  useEffect(() => {
    apiClient.get('/products').catch(() => {
      /* warm-up only — failures are retried by the real requests */
    });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const storedUser = localStorage.getItem('adminUser');
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
        // Permissions stored at login time can go stale when a Super
        // Admin edits the matrix — refresh them from the API so the
        // shell's gating matches the backend's current rules. Best
        // effort: on failure the stored copy stays in place.
        apiClient
          .get('/permissions/me')
          .then((res) => {
            const fresh = res.data as {
              role?: string;
              name?: string;
              avatar?: string;
              permissions?: PermissionMatrix;
            };
            if (!fresh?.permissions) return;
            setUser((current) => {
              if (!current) return current;
              const updated: AdminUser = {
                ...current,
                role: fresh.role || current.role,
                // Name + avatar refresh too: a profile photo set after
                // this session's login must reach the TopBar/sidebar
                // chips without a logout/login cycle. Same placeholder
                // normalisation as completeLogin.
                name: fresh.name || current.name,
                avatar:
                  fresh.avatar !== undefined
                    ? fresh.avatar && fresh.avatar !== 'default-avatar.png'
                      ? fresh.avatar
                      : undefined
                    : current.avatar,
                permissions: fresh.permissions,
              };
              try {
                localStorage.setItem('adminUser', JSON.stringify(updated));
              } catch {
                /* persistence is best-effort */
              }
              return updated;
            });
          })
          .catch(() => {
            /* keep the stored permissions */
          });
      } catch {
        localStorage.removeItem('adminUser');
      }
    }
    setIsRestoring(false);
  }, []);

  /**
   * UI gating for the role permission matrix. The backend re-checks every
   * call (403), so this only decides what to SHOW: Super Admin always
   * passes; while permissions have not loaded yet the answer is "yes" so
   * the shell never flickers or hides things spuriously.
   */
  const hasPermission = useCallback(
    (module: string, action: string): boolean => {
      if (!user) return true;
      if (user.role === 'Super Admin') return true;
      if (!user.permissions) return true;
      return Boolean(user.permissions[module]?.[action]);
    },
    [user],
  );

  // The API layer clears the stored token and fires this event when the
  // backend rejects it (401) — drop to the login popup with an explanation.
  useEffect(() => {
    const handleExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      setSessionNotice(
        translate(readDeviceLanguage(), 'Your session expired. Please sign in again.'),
      );
    };
    window.addEventListener('admin:session-expired', handleExpired);
    return () => window.removeEventListener('admin:session-expired', handleExpired);
  }, []);

  // Stores the session from a completed sign-in payload — shared by the
  // plain login and the second step of a two-factor login, which return
  // the identical shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completeLogin = (data: any, fallbackEmail: string) => {
    const { token, _id, name, email: userEmail, role, avatar, permissions } = data;

    localStorage.setItem('adminToken', token);

    const userData: AdminUser = {
      id: _id,
      name: name || 'Admin',
      email: userEmail || fallbackEmail,
      // The API returns the account's real role ("Super Admin", "Admin",
      // …) — show it exactly as stored.
      role: role || 'Admin',
      avatar: avatar && avatar !== 'default-avatar.png' ? avatar : undefined,
      permissions: permissions as PermissionMatrix | undefined,
    };
    localStorage.setItem('adminUser', JSON.stringify(userData));

    setUser(userData);
    setIsAuthenticated(true);
    setSessionNotice(null);
  };

  /**
   * First factor only. The API answers with a temp token instead of a
   * session whenever a second step is still owed — a TOTP code for an
   * account with 2FA on (finish with verifyTwoFactor), or mandatory
   * enrolment for an account without 2FA yet (finish with
   * startLoginEnrolment + confirmLoginEnrolment). Every staff account
   * has 2FA, asked only here, at sign-in.
   */
  const login = async (
    email: string,
    password: string,
  ): Promise<
    | { status: 'authenticated' }
    | { status: 'two-factor-required'; tempToken: string }
    | { status: 'two-factor-setup-required'; tempToken: string }
  > => {
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      if (res.data?.twoFactorRequired) {
        return { status: 'two-factor-required', tempToken: res.data.tempToken };
      }
      if (res.data?.twoFactorSetupRequired) {
        return { status: 'two-factor-setup-required', tempToken: res.data.tempToken };
      }
      completeLogin(res.data, email);
      return { status: 'authenticated' };
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  /** Second factor: temp token + 6-digit code → a real session. */
  const verifyTwoFactor = async (tempToken: string, code: string): Promise<boolean> => {
    const res = await apiClient.post('/auth/2fa/verify', { tempToken, code });
    completeLogin(res.data, '');
    return true;
  };

  /**
   * Mandatory enrolment, step 1: exchange the enrolment temp token for
   * the account's fresh TOTP secret + QR code. The secret is shown only
   * in this sign-in flow (and the in-panel setup) — never again.
   */
  const startLoginEnrolment = async (
    tempToken: string,
  ): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> => {
    const res = await apiClient.post('/auth/2fa/enroll-setup', { tempToken });
    return res.data;
  };

  /**
   * Mandatory enrolment, step 2: a live code from the authenticator
   * just enrolled turns 2FA on for the account, and the API answers
   * with the real session — enrolment completes the sign-in.
   */
  const confirmLoginEnrolment = async (tempToken: string, code: string): Promise<boolean> => {
    const res = await apiClient.post('/auth/2fa/enroll-confirm', { tempToken, code });
    completeLogin(res.data, '');
    return true;
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isRestoring, user, login, verifyTwoFactor, startLoginEnrolment, confirmLoginEnrolment, logout, sessionNotice, clearNotice, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
};
