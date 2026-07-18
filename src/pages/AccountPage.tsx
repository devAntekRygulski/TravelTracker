import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TOTAL_MAP_COUNTRIES } from '../data/mapCountries';
import { countVisitedContinents } from '../data/countryContinents';
import { useAuth } from '../hooks/useAuth';
import './AccountPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

function DigitValue({ value, ariaLabel }: { value: number; ariaLabel: string }) {
  const digits = String(Math.max(0, value)).split('');

  return (
    <div className="account-page__digits" aria-label={ariaLabel}>
      {digits.map((digit, index) => (
        <img
          key={`${ariaLabel}-${index}-${digit}`}
          className="account-page__digit"
          src={`/${digit}.png`}
          alt=""
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function PercentValue({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const digits = String(clamped).split('');

  return (
    <div className="account-page__digits" aria-label={`${clamped} percent`}>
      {digits.map((digit, index) => (
        <img
          key={`percent-${index}-${digit}`}
          className="account-page__digit"
          src={`/${digit}.png`}
          alt=""
          aria-hidden="true"
        />
      ))}
      <img
        className="account-page__percent"
        src="/percentege_sign.png"
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const { user, isGuest, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || isGuest) {
      navigate('/login', { replace: true });
    }
  }, [isLoading, user, isGuest, navigate]);

  if (isLoading || !user || isGuest) {
    return <div className="account-page account-page--loading" />;
  }

  const countriesVisited = user.visitedCountries.length;
  const continentsVisited = countVisitedContinents(
    new Set(user.visitedCountries),
  );
  const percentVisited = Math.round(
    (countriesVisited / TOTAL_MAP_COUNTRIES) * 100,
  );

  return (
    <div className="account-page">
      <div className="account-page__content">
        <div className="account-page__logo-wrap">
          <img
            className="account-page__logo"
            src={LOGO_URL}
            alt="Travel Tracker"
          />
        </div>

        <header className="account-page__header">
          <h1 className="account-page__title">My account</h1>
          <p className="account-page__subtitle">
            Your profile and travel progress
          </p>
        </header>

        <section className="account-page__card" aria-label="Account details">
          <div className="account-page__field">
            <span className="account-page__label">Email</span>
            <p className="account-page__value">{user.email}</p>
          </div>

          <div className="account-page__divider" />

          <div className="account-page__field">
            <span className="account-page__label">Password</span>
            <p className="account-page__value account-page__value--password">
              ••••••••••••
            </p>
            <span className="account-page__hint">
              Stored as a secure hash — never shown in plain text
            </span>
          </div>
        </section>

        <section className="account-page__stats" aria-label="Travel statistics">
          <div className="account-page__stat">
            <PercentValue value={percentVisited} />
            <span className="account-page__stat-label">of countries visited</span>
          </div>
          <div className="account-page__stat">
            <DigitValue
              value={countriesVisited}
              ariaLabel={`${countriesVisited} countries visited`}
            />
            <span className="account-page__stat-label">countries visited</span>
          </div>
          <div className="account-page__stat">
            <DigitValue
              value={continentsVisited}
              ariaLabel={`${continentsVisited} continents visited`}
            />
            <span className="account-page__stat-label">continents visited</span>
          </div>
        </section>

        <div className="account-page__links">
          <Link className="account-page__link account-page__link--primary" to="/map">
            Back to map
          </Link>
          <Link className="account-page__link" to="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
