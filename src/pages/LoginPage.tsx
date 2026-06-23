import { useNavigate } from 'react-router-dom';
import { AuthButton } from '../components/AuthButton';
import './LoginPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function LoginPage() {
  const navigate = useNavigate();

  const handleGuest = () => {
    sessionStorage.setItem('guestMode', 'true');
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
          <AuthButton variant="login" disabled comingSoon>
            Log in
          </AuthButton>
        </div>
        <p className="login-page__create-account">Create an account</p>
      </div>
    </div>
  );
}
