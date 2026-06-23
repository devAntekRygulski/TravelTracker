import { Link, useNavigate } from 'react-router-dom';
import { AuthButton } from '../components/AuthButton';
import { useAuth } from '../hooks/useAuth';
import './LoginPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function LoginPage() {
  const navigate = useNavigate();
  const { enterGuestMode } = useAuth();

  const handleGuest = () => {
    enterGuestMode();
    navigate('/map');
  };

  return (
    <div className="login-page">
      <div className="login-page__content">
        <div className="login-page__logo-wrap">
          <img
            className="login-page__logo"
            src={LOGO_URL}
            alt="Travel Tracker"
          />
        </div>
        <p className="login-page__subtitle">Mark the countries you&apos;ve explored</p>
        <div className="login-page__buttons">
          <AuthButton variant="guest" onClick={handleGuest}>
            Use as guest
          </AuthButton>
          <AuthButton variant="login" onClick={() => navigate('/login')}>
            Log in
          </AuthButton>
        </div>
        <Link className="login-page__create-account" to="/signup">
          Create an account
        </Link>
      </div>
    </div>
  );
}
