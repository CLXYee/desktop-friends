import type { ReactNode } from 'react';
import { useAccount } from './account';
import { AuthScreen } from './AuthScreen';

/** Shows the log in / sign up screen until someone is signed in, then the app. */
export function AccountGate({ children }: { children: ReactNode }) {
  const { status } = useAccount();
  if (status === 'loading') {
    return (
      <main className="auth-loading" aria-busy="true">
        <div className="brand-mark" aria-hidden="true">df</div>
        <p>Signing you in…</p>
      </main>
    );
  }
  return status === 'signed-in' ? <>{children}</> : <AuthScreen />;
}
