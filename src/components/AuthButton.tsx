import type { AuthButtonVariant } from '../types';
import './AuthButton.css';

interface AuthButtonProps {
  variant: AuthButtonVariant;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}

export function AuthButton({
  variant,
  children,
  onClick,
  disabled = false,
  comingSoon = false,
}: AuthButtonProps) {
  return (
    <button
      type="button"
      className={`auth-button auth-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="auth-button__label">{children}</span>
      {comingSoon && <span className="auth-button__badge">Coming soon</span>}
    </button>
  );
}
