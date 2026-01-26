import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          Voice Crowdsourcing
        </Link>

        <nav className="nav">
          {isAuthenticated ? (
            <>
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/validate">Validate</NavLink>
              <NavLink to="/my-recordings">My Recordings</NavLink>

              {isAdmin && (
                <>
                  <NavLink to="/admin/corpora">Corpora</NavLink>
                  <NavLink to="/admin/export">Export</NavLink>
                </>
              )}

              <NavLink to="/profile">Profile</NavLink>

              <button onClick={handleLogout} className="btn btn-outline btn-sm">
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
