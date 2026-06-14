'use client';

import React, { createContext, useState, useEffect, useContext } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarInitials?: string;
  avatarColor?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Parse JWT token helper (decodes the base64 payload to retrieve email/userId if needed)
  const parseJwt = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = localStorage.getItem('ss_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }

        const res = await api.post('/auth/refresh', {});
        if (res && res.accessToken) {
          api.setAccessToken(res.accessToken);
          
          // Decode token to find email/userId and match with stored user details
          const decoded = parseJwt(res.accessToken);
          if (decoded) {
            if (!storedUser) {
              const defaultUser: User = {
                id: decoded.sub,
                email: decoded.email,
                displayName: decoded.email.split('@')[0],
              };
              setUser(defaultUser);
              localStorage.setItem('ss_user', JSON.stringify(defaultUser));
            }
          }
        }
      } catch (err) {
        localStorage.removeItem('ss_user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      api.setAccessToken(res.accessToken);
      setUser(res.user);
      localStorage.setItem('ss_user', JSON.stringify(res.user));
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { displayName: name, email, password });
      api.setAccessToken(res.accessToken);
      setUser(res.user);
      localStorage.setItem('ss_user', JSON.stringify(res.user));
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.post('/auth/logout', {});
    } catch (err) {
      console.error('Logout error on server', err);
    } finally {
      api.setAccessToken(null);
      setUser(null);
      localStorage.removeItem('ss_user');
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
