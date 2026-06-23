import { useState } from 'react';
import './PasswordInput.css';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  required = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        id={id}
        className="password-input__field auth-form__input"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? (
          <svg
            className="password-input__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M3 3l18 18" />
            <path d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-3.42" />
            <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7.5a11.61 11.61 0 0 1-1.67 2.86" />
            <path d="M6.06 6.06A11.8 11.8 0 0 0 1 12.5C2.73 16.89 7 20 12 20a10.7 10.7 0 0 0 4.12-.8" />
          </svg>
        ) : (
          <svg
            className="password-input__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M1 12.5C2.73 7.11 7 4 12 4s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.89 1 12.5z" />
            <circle cx="12" cy="12.5" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
