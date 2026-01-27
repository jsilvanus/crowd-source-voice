import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Header from './Header';
import { AuthProvider } from '../contexts/AuthContext';

// Mock the auth context
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn()
  };
});

import { useAuth } from '../contexts/AuthContext';

const renderHeader = () => {
  return render(
    <BrowserRouter>
      <Header />
    </BrowserRouter>
  );
};

describe('Header', () => {
  test('shows login and register links when not authenticated', () => {
    useAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      logout: vi.fn()
    });

    renderHeader();

    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  test('shows user navigation when authenticated', () => {
    useAuth.mockReturnValue({
      user: { id: 1, email: 'test@example.com', role: 'user' },
      isAuthenticated: true,
      isAdmin: false,
      logout: vi.fn()
    });

    renderHeader();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Validate')).toBeInTheDocument();
    expect(screen.getByText('My Recordings')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  test('shows admin links when user is admin', () => {
    useAuth.mockReturnValue({
      user: { id: 1, email: 'admin@example.com', role: 'admin' },
      isAuthenticated: true,
      isAdmin: true,
      logout: vi.fn()
    });

    renderHeader();

    expect(screen.getByText('Corpora')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  test('does not show admin links for regular users', () => {
    useAuth.mockReturnValue({
      user: { id: 1, email: 'test@example.com', role: 'user' },
      isAuthenticated: true,
      isAdmin: false,
      logout: vi.fn()
    });

    renderHeader();

    expect(screen.queryByText('Corpora')).not.toBeInTheDocument();
    expect(screen.queryByText('Export')).not.toBeInTheDocument();
  });

  test('displays app logo', () => {
    useAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      logout: vi.fn()
    });

    renderHeader();

    expect(screen.getByText('Voice Crowdsourcing')).toBeInTheDocument();
  });
});
