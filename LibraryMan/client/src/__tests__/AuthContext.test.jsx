import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

function Probe() {
  const { user, role, isAdmin, isAuthenticated, devSignInAs, signOut } = useAuth();
  return (
    <div>
      <div data-testid="auth">{isAuthenticated ? 'in' : 'out'}</div>
      <div data-testid="role">{role || 'none'}</div>
      <div data-testid="admin">{String(isAdmin)}</div>
      <div data-testid="email">{user?.email_id || ''}</div>
      <button onClick={() => devSignInAs('admin')}>admin</button>
      <button onClick={() => devSignInAs('member')}>member</button>
      <button onClick={signOut}>out</button>
    </div>
  );
}

const renderProbe = () =>
  render(<AuthProvider><Probe /></AuthProvider>);

describe('<AuthProvider>', () => {
  it('starts unauthenticated', async () => {
    renderProbe();
    expect(await screen.findByTestId('auth')).toHaveTextContent('out');
    expect(screen.getByTestId('role')).toHaveTextContent('none');
  });

  it('devSignInAs("admin") flips state to admin', async () => {
    renderProbe();
    await screen.findByTestId('auth');
    await act(async () => {
      screen.getByText('admin').click();
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('in');
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('admin')).toHaveTextContent('true');
    expect(screen.getByTestId('email')).toHaveTextContent('admin@local');
  });

  it('devSignInAs("member") then signOut', async () => {
    renderProbe();
    await screen.findByTestId('auth');
    await act(async () => { screen.getByText('member').click(); });
    expect(screen.getByTestId('role')).toHaveTextContent('member');
    expect(screen.getByTestId('admin')).toHaveTextContent('false');
    await act(async () => { screen.getByText('out').click(); });
    expect(screen.getByTestId('auth')).toHaveTextContent('out');
  });
});
