"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AuthContext = createContext<any>(null);

export const useAdminAuth = () => useContext(AuthContext);

export interface AdminUser {
  id?: string;
  name: string;
  email?: string;
  role: string;
  avatar?: string;
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
      } catch {
        localStorage.removeItem('adminUser');
      }
    }
    setIsRestoring(false);
  }, []);

  // The API layer clears the stored token and fires this event when the
  // backend rejects it (401) — drop to the login popup with an explanation.
  useEffect(() => {
    const handleExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      setSessionNotice('Your session expired. Please sign in again.');
    };
    window.addEventListener('admin:session-expired', handleExpired);
    return () => window.removeEventListener('admin:session-expired', handleExpired);
  }, []);

  // Stores the session from a completed sign-in payload — shared by the
  // plain login and the second step of a two-factor login, which return
  // the identical shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completeLogin = (data: any, fallbackEmail: string) => {
    const { token, _id, name, email: userEmail, role, avatar } = data;

    localStorage.setItem('adminToken', token);

    const userData: AdminUser = {
      id: _id,
      name: name || 'Admin',
      email: userEmail || fallbackEmail,
      // The API returns the account's real role ("Super Admin", "Admin",
      // …) — show it exactly as stored.
      role: role || 'Admin',
      avatar: avatar && avatar !== 'default-avatar.png' ? avatar : undefined,
    };
    localStorage.setItem('adminUser', JSON.stringify(userData));

    setUser(userData);
    setIsAuthenticated(true);
    setSessionNotice(null);
  };

  /**
   * First factor only. When the account has two-factor authentication
   * on, the API answers with a temp token instead of a session — the
   * caller must collect the TOTP code and finish with verifyTwoFactor.
   */
  const login = async (
    email: string,
    password: string,
  ): Promise<{ status: 'authenticated' } | { status: 'two-factor-required'; tempToken: string }> => {
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      if (res.data?.twoFactorRequired) {
        return { status: 'two-factor-required', tempToken: res.data.tempToken };
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

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isRestoring, user, login, verifyTwoFactor, logout, sessionNotice, clearNotice }}
    >
      {children}
    </AuthContext.Provider>
  );
};
