import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import SignInGate from '../auth/SignInGate';

function Probe() {
  const { user, provider, role } = useAuth();
  return (
    <div>
      <div data-testid="user">{user?.email_id || 'none'}</div>
      <div data-testid="provider">{provider || 'none'}</div>
      <div data-testid="role">{role || 'none'}</div>
    </div>
  );
}

function renderGate() {
  return render(
    <AuthProvider>
      <SignInGate />
      <Probe />
    </AuthProvider>
  );
}

describe('<SignInGate />', () => {
  it('renders Zoho and Google buttons in mock mode', async () => {
    renderGate();
    expect(await screen.findByRole('button', { name: /Continue with Zoho/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('clicking Zoho signs the user in (mock mode → admin)', async () => {
    renderGate();
    const btn = await screen.findByRole('button', { name: /Continue with Zoho/i });
    await act(async () => { btn.click(); });
    expect(screen.getByTestId('provider')).toHaveTextContent('zoho');
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('user')).toHaveTextContent('admin@zoho.local');
  });

  it('clicking Google signs the user in (mock mode → member)', async () => {
    renderGate();
    const btn = await screen.findByRole('button', { name: /Continue with Google/i });
    await act(async () => { btn.click(); });
    expect(screen.getByTestId('provider')).toHaveTextContent('google');
    expect(screen.getByTestId('role')).toHaveTextContent('member');
  });

  it('dev role buttons still work alongside provider buttons', async () => {
    renderGate();
    const adminBtn = await screen.findByRole('button', { name: /^Admin \(email\)$/ });
    await act(async () => { adminBtn.click(); });
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('provider')).toHaveTextContent('none'); // plain email path
  });
});
