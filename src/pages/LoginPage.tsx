import { useNavigate } from 'react-router-dom';
import { AuthButton } from '../components/AuthButton';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();

  const handleGuest = () => {
    sessionStorage.setItem('guestMode', 'true');
    navigate('/map');
  };

  return (
    <div className="login-page">
      <div className="login-page__content">
        <h1 className="login-page__title">Country Tracker</h1>
        <p className="login-page__subtitle">Mark the countries you&apos;ve explored</p>
        <div className="login-page__buttons">
          <AuthButton variant="login" disabled comingSoon>
            Log in
          </AuthButton>
          <AuthButton variant="signup" disabled comingSoon>
            Sign up
          </AuthButton>
          <AuthButton variant="guest" onClick={handleGuest}>
            Use as guest
          </AuthButton>
        </div>
      </div>
    </div>
  );
}
