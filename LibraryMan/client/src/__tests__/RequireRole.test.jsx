import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import RequireRole from '../auth/RequireRole';

function Toggle({ role }) {
  const { devSignInAs } = useAuth();
  return <button onClick={() => devSignInAs(role)}>{role}</button>;
}

function Tree({ allowed }) {
  return (
    <AuthProvider>
      <Toggle role="admin" />
      <Toggle role="member" />
      <RequireRole roles={allowed}>
        <div data-testid="protected">SECRET</div>
      </RequireRole>
    </AuthProvider>
  );
}

describe('<RequireRole>', () => {
  it('hides content for anonymous users', async () => {
    render(<Tree allowed={['admin']} />);
    expect(await screen.findByText(/Please sign in/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('blocks members from admin-only content', async () => {
    render(<Tree allowed={['admin']} />);
    await screen.findByText(/Please sign in/i);
    await act(async () => { screen.getByText('member').click(); });
    expect(screen.getByText(/Not allowed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('lets admins through admin-only content', async () => {
    render(<Tree allowed={['admin']} />);
    await screen.findByText(/Please sign in/i);
    await act(async () => { screen.getByText('admin').click(); });
    expect(screen.getByTestId('protected')).toHaveTextContent('SECRET');
  });

  it('lets members through member-or-admin content', async () => {
    render(<Tree allowed={['member', 'admin']} />);
    await screen.findByText(/Please sign in/i);
    await act(async () => { screen.getByText('member').click(); });
    expect(screen.getByTestId('protected')).toHaveTextContent('SECRET');
  });
});
