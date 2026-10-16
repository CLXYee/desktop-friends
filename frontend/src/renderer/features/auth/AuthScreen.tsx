import { useEffect, useId, useState, type FormEvent } from 'react';
import { DISPLAY_NAME_MAX, isStrongPassword, isValidUsername, passwordRules } from '../../../shared/auth';
import { characters } from '../../../shared/characters';
import { canRememberSession } from '../../services/session';
import { CrystalAnimationPreview } from '../pets/CrystalAnimationPreview';
import { characterThemeStyle } from '../pets/characterThemes';
import { useAccount } from './account';

const CHARACTER_ROTATION_MS = 60_000;

type Mode = 'login' | 'signup';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  describedBy?: string;
  invalid?: boolean;
}

function PasswordField({ label, value, onChange, autoComplete, describedBy, invalid = false }: PasswordFieldProps) {
  const id = useId();
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="auth-reveal" onClick={() => setIsVisible((visible) => !visible)}>
          {isVisible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

export function AuthScreen() {
  const { status, signIn, signUp } = useAccount();
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [canRemember, setCanRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // A random friend greets you, and the next one takes over every minute.
  const [characterIndex, setCharacterIndex] = useState(() => Math.floor(Math.random() * characters.length));
  const usernameHintId = useId();
  const rulesId = useId();

  useEffect(() => {
    void canRememberSession().then((available) => {
      setCanRemember(available);
      if (!available) setRemember(false);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCharacterIndex((index) => (index + 1) % characters.length), CHARACTER_ROTATION_MS);
    return () => clearInterval(timer);
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const character = characters[characterIndex];
  const isSignup = mode === 'signup';
  const passwordsMatch = password === confirmPassword;
  const canSubmit = isSignup
    ? displayName.trim().length > 0 && isValidUsername(username) && isStrongPassword(password) && passwordsMatch
    : username.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    setIsBusy(true);
    setError(null);
    const message = isSignup
      ? await signUp({ displayName, username, password, remember })
      : await signIn({ username, password, remember });
    setIsBusy(false);
    if (message) setError(message);
  };

  return (
    <main className="auth-shell" style={characterThemeStyle(character.id)}>
      <section className="auth-hero" aria-hidden="true">
        <div className="brand-mark">df</div>
        <p className="eyebrow">A LITTLE CORNER OF THE INTERNET</p>
        <h1>Desktop Friends</h1>
        <p className="auth-tagline">{character.name} is waiting for you. Log in to pick up where you left off.</p>
        <div className="auth-hero-stage" key={character.id}>
          <span className="preview-sun" />
          <CrystalAnimationPreview characterId={character.id} displayName={character.name} activity="waving" />
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={!isSignup} className="auth-tab" onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={isSignup} className="auth-tab" onClick={() => switchMode('signup')}>
            Sign up
          </button>
        </div>

        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>

        {status === 'unconfigured' ? (
          <p className="auth-error" role="alert">
            The app isn&apos;t connected to a server yet. Set VITE_API_BASE_URL in frontend/.env (e.g. http://localhost:8088/api), then restart.
          </p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isSignup && (
              <div className="auth-field">
                <label htmlFor="auth-display-name">Your name</label>
                <input
                  id="auth-display-name"
                  value={displayName}
                  maxLength={DISPLAY_NAME_MAX}
                  autoComplete="nickname"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={isSignup ? usernameHintId : undefined}
                aria-invalid={isSignup && username.length > 0 && !isValidUsername(username)}
                onChange={(event) => setUsername(event.target.value)}
              />
              {isSignup && <p id={usernameHintId} className="auth-hint">3–20 lowercase letters, numbers or underscores.</p>}
            </div>

            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              describedBy={isSignup ? rulesId : undefined}
            />

            {isSignup && (
              <>
                <ul id={rulesId} className="auth-rules" aria-label="Password rules">
                  {passwordRules.map((rule) => {
                    const isMet = rule.test(password);
                    return (
                      <li key={rule.id} className={isMet ? 'auth-rule-met' : undefined}>
                        <span aria-hidden="true">{isMet ? '✓' : '○'}</span>
                        {rule.label}
                        <span className="auth-sr-only">{isMet ? ' (done)' : ' (needed)'}</span>
                      </li>
                    );
                  })}
                </ul>
                <PasswordField
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  invalid={confirmPassword.length > 0 && !passwordsMatch}
                />
                {confirmPassword.length > 0 && !passwordsMatch && <p className="auth-hint auth-hint-error">The passwords don&apos;t match.</p>}
              </>
            )}

            <label className="auth-remember">
              <input
                type="checkbox"
                checked={remember}
                disabled={!canRemember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>
                Remember me
                <small>{canRemember ? 'Log in automatically next time on this computer.' : 'Not available: this computer cannot store it securely.'}</small>
              </span>
            </label>

            <div className="auth-error-slot" aria-live="polite">
              {error && <p className="auth-error" role="alert">{error}</p>}
            </div>

            <button className="auth-submit" type="submit" disabled={!canSubmit || isBusy}>
              {isBusy ? (isSignup ? 'Creating account…' : 'Logging in…') : (isSignup ? 'Create account' : 'Log in')}
            </button>

            <p className="auth-switch">
              {isSignup ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
                {isSignup ? 'Log in' : 'Create an account'}
              </button>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
