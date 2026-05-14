import React from 'react';
import { useAuth } from './AuthContext';
import { getRole } from './catalystAuth';

/**
 * Route guard — renders children only when the authenticated user has one of
 * the allowed roles. Shows a friendly "forbidden" card otherwise.
 *
 * Usage:
 *   <Route path="/add" element={<RequireRole roles={['admin']}><AddBook ... /></RequireRole>} />
 */
export default function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Checking permissions…</div>;
  if (!user) {
    return <div className="card empty">Please sign in to access this page.</div>;
  }
  const role = getRole(user);
  if (!roles.includes(role)) {
    return (
      <div className="card empty">
        <h2>🚫 Not allowed</h2>
        <p>This page requires role: <strong>{roles.join(' or ')}</strong>.</p>
        <p className="muted">Your role: <strong>{role}</strong></p>
      </div>
    );
  }
  return children;
}
