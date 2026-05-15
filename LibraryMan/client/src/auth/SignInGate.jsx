import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { renderSignIn } from './catalystAuth';

/**
 * SignInGate — shown when the user is anonymous.
 *
 * Order of preference:
 *   1. Zoho / Google federated sign-in buttons (full OAuth + PKCE round-trip)
 *   2. Catalyst hosted email/password iframe (always available in prod)
 *   3. Dev role-toggle buttons (mock mode only)
 */
export default function SignInGate() {
  const { isMock, providers, signInWithProvider, devSignInAs, devSignInWithProvider } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isMock) return;
    renderSignIn('catalyst-signin').catch((err) =>
      console.error('Catalyst signIn failed:', err.message)
    );
  }, [isMock]);

  const handleProvider = async (name) => {
    setError(null);
    setBusy(name);
    try {
      await signInWithProvider(name);
    } catch (e) {
      setError(e.message || `Sign-in with ${name} failed`);
      setBusy(null);
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="signin-title">
      <h2 id="signin-title">Sign in to LibraryMan</h2>
      <p className="muted">
        Choose your identity provider. We use OAuth 2.0 with PKCE — your
        password never reaches LibraryMan.
      </p>

      {error && <div role="alert" className="toast toast-error" style={{ position: 'static', marginBottom: 12 }}>{error}</div>}

      <div className="provider-buttons" role="group" aria-label="Identity providers">
        {providers.map((p) => (
          <button
            key={p.name}
            className={`btn-provider btn-provider-${p.name}`}
            onClick={() => handleProvider(p.name)}
            disabled={Boolean(busy)}
            aria-label={`Continue with ${p.label}`}
          >
            <span className="provider-icon" aria-hidden="true">{providerIcon(p.name)}</span>
            <span>{busy === p.name ? `Connecting to ${p.label}…` : `Continue with ${p.label}`}</span>
          </button>
        ))}
        {providers.length === 0 && (
          <p className="muted">
            {isMock
              ? 'No federated providers configured for dev. Pick a synthetic identity below.'
              : 'No federated providers are configured. Use email/password below.'}
          </p>
        )}
      </div>

      {isMock ? (
        <div className="dev-auth">
          <p className="muted"><strong>Dev mode</strong> — pick a synthetic identity:</p>
          <div className="dev-auth-buttons">
            <button onClick={() => devSignInAs('member')}>Member (email)</button>
            <button onClick={() => devSignInAs('admin')} className="btn-admin">Admin (email)</button>
            <button onClick={() => devSignInWithProvider('zoho', 'admin')} className="btn-provider btn-provider-zoho">Zoho admin</button>
            <button onClick={() => devSignInWithProvider('google', 'member')} className="btn-provider btn-provider-google">Google member</button>
          </div>
        </div>
      ) : (
        <>
          <div className="divider"><span>or</span></div>
          <div id="catalyst-signin" className="catalyst-signin-frame" />
        </>
      )}
    </section>
  );
}

function providerIcon(name) {
  if (name === 'google') return 'G';
  if (name === 'zoho') return 'Z';
  return '•';
}
