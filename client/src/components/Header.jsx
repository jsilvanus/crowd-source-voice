import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../contexts/I18nContext';

export default function Header() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage, languages } = useI18n();
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
              <NavLink to="/">{t('nav.dashboard')}</NavLink>
              <NavLink to="/validate">{t('nav.validate')}</NavLink>
              <NavLink to="/my-recordings">{t('nav.myRecordings')}</NavLink>

              {isAdmin && (
                <>
                  <NavLink to="/admin/dashboard">{t('nav.admin')}</NavLink>
                  <NavLink to="/admin/corpora">{t('nav.corpora')}</NavLink>
                  <NavLink to="/admin/users">{t('nav.users')}</NavLink>
                  <NavLink to="/admin/export">{t('nav.export')}</NavLink>
                </>
              )}

              <NavLink to="/profile">{t('nav.profile')}</NavLink>

              <button onClick={handleLogout} className="btn btn-outline btn-sm">
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">{t('nav.login')}</NavLink>
              <NavLink to="/register">{t('nav.register')}</NavLink>
            </>
          )}

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="btn btn-outline btn-sm"
            style={{ padding: '0.4rem 0.5rem', minWidth: 'auto', cursor: 'pointer' }}
          >
            {languages.map(({ code, flag, name }) => (
              <option key={code} value={code}>
                {flag} {name}
              </option>
            ))}
          </select>

          <button
            onClick={toggleTheme}
            className="btn btn-outline btn-sm"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            style={{ padding: '0.5rem', minWidth: 'auto' }}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </nav>
      </div>
    </header>
  );
}
