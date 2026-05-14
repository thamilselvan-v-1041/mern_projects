import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCurrentUser, signOut as sdkSignOut, getRole, isMockMode, mockSignIn } from './catalystAuth';
import { beginOAuth, completeOAuth as oauthComplete, listProviders, mockSignInWithProvider } from './oauthClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getCurrentUser();
      setUser(u);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load enabled OAuth providers once on mount
  useEffect(() => {
    listProviders()
      .then((d) => setProviders(d.providers || []))
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await sdkSignOut();
    setUser(null);
  }, []);

  // Dev-only — switch identity without a real SSO
  const devSignInAs = useCallback((role) => {
    if (!isMockMode()) return;
    const u = mockSignIn(role);
    setUser(u);
  }, []);

  // Real OAuth — kicks off a redirect to the provider (or mocks in dev)
  const signInWithProvider = useCallback(async (providerName) => {
    const redirectUri = window.location.origin + '/auth/callback';
    const res = await beginOAuth(providerName, redirectUri);
    if (res?.mock && res.user) setUser(res.user);
    return res;
  }, []);

  // Dev-only — quick provider mock without redirect (used by SignInGate buttons)
  const devSignInWithProvider = useCallback((providerName, role) => {
    if (!isMockMode()) return;
    const u = mockSignInWithProvider(providerName, role);
    setUser(u);
  }, []);

  // Called by the OAuthCallback route after the browser returns from the provider
  const finalizeOAuth = useCallback(async () => {
    const { user: u } = await oauthComplete();
    setUser(u);
    return u;
  }, []);

  const value = {
    user,
    loading,
    role: user ? getRole(user) : null,
    provider: user?.provider || null,
    isAdmin:  user && getRole(user) === 'admin',
    isMember: user && (getRole(user) === 'member' || getRole(user) === 'admin'),
    isAuthenticated: !!user,
    isMock: isMockMode(),
    providers,
    refresh,
    signOut,
    devSignInAs,
    signInWithProvider,
    devSignInWithProvider,
    finalizeOAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
