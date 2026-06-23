import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthButton } from '../components/AuthButton';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth } from '../hooks/useAuth';
import './AuthFormPage.css';

const LOGO_URL = '/travel-tracker-logo.png';

export function LoginFormPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/map');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to log in',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__content">
        <div className="auth-page__logo-wrap">
          <img className="auth-page__logo" src={LOGO_URL} alt="Travel Tracker" />
        </div>
        <p className="auth-page__subtitle">Log in to your account</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-form__field">
            <span className="auth-form__label">Email</span>
            <input
              className="auth-form__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="auth-form__field">
            <span className="auth-form__label">Password</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="auth-form__error">{error}</p>}

          <AuthButton variant="login" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Log in'}
          </AuthButton>
        </form>

        <Link className="auth-page__link" to="/signup">
          Create an account
        </Link>
        <Link className="auth-page__link auth-page__link--muted" to="/">
          Back
        </Link>
      </div>
    </div>
  );
}
