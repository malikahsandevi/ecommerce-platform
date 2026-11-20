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

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      const { token, _id, name, email: userEmail, role, avatar } = res.data;

      localStorage.setItem('adminToken', token);

      const userData: AdminUser = {
        id: _id,
        name: name || 'Admin',
        email: userEmail || email,
        // The API returns lowercase "admin"; present roles in title case.
        role: role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Admin',
        avatar: avatar && avatar !== 'default-avatar.png' ? avatar : undefined,
      };
      localStorage.setItem('adminUser', JSON.stringify(userData));

      setUser(userData);
      setIsAuthenticated(true);
      setSessionNotice(null);
      return true;
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isRestoring, user, login, logout, sessionNotice, clearNotice }}
    >
      {children}
    </AuthContext.Provider>
  );
};
