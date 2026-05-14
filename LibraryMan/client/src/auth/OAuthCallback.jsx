import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Browser landing page after the OAuth provider redirects back.
 * Validates state, exchanges the code via the backend, and routes home.
 */
export default function OAuthCallback() {
  const { finalizeOAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await finalizeOAuth();
        if (!cancelled) navigate('/', { replace: true });
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [finalizeOAuth, navigate]);

  if (error) {
    return (
      <div className="card empty" role="alert">
        <h2>Sign-in failed</h2>
        <p className="muted">{error}</p>
        <button onClick={() => navigate('/', { replace: true })}>Back to home</button>
      </div>
    );
  }

  return <div className="loading" role="status">Finishing sign-in…</div>;
}
