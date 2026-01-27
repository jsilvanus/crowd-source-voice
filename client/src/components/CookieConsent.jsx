import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';

const CONSENT_KEY = 'cookie_consent';

export default function CookieConsent() {
  const { t } = useI18n();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if consent has been given
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      // Small delay to avoid flash on page load
      const timer = setTimeout(() => setShowBanner(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcknowledge = () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      acknowledged: true,
      timestamp: new Date().toISOString()
    }));
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: '1rem',
      zIndex: 1000,
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)'
    }}>
      <div className="container" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: 900,
        margin: '0 auto'
      }}>
        <div>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
            {t('cookies.title')}
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {t('cookies.description')}
          </p>
          <ul style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            paddingLeft: '1.25rem',
            marginBottom: '0.5rem'
          }}>
            <li>{t('cookies.items.auth')}</li>
            <li>{t('cookies.items.language')}</li>
            <li>{t('cookies.items.theme')}</li>
            <li>{t('cookies.items.consent')}</li>
          </ul>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t('cookies.moreInfo')}{' '}
            <Link to="/privacy" style={{ color: 'var(--primary)' }}>
              {t('legal.privacyPolicy')}
            </Link>.
          </p>
        </div>
        <div>
          <button
            onClick={handleAcknowledge}
            className="btn btn-primary"
          >
            {t('cookies.understand')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to check if user has acknowledged the storage notice
export function hasAcknowledgedStorage() {
  try {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) return false;
    const parsed = JSON.parse(consent);
    return parsed.acknowledged === true;
  } catch {
    return false;
  }
}
