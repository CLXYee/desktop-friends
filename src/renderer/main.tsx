import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AccountProvider } from './features/auth/account';
import { AccountGate } from './features/auth/AccountGate';
import { DesktopAvatar } from './features/pets/DesktopAvatar';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Renderer root element is missing.');

// The desktop avatar window loads this same bundle with #avatar.
const isAvatarWindow = window.location.hash === '#avatar';
if (isAvatarWindow) document.documentElement.classList.add('avatar-mode');

createRoot(rootElement).render(
  <React.StrictMode>
    {isAvatarWindow ? (
      <DesktopAvatar />
    ) : (
      <AccountProvider>
        <AccountGate>
          <App />
        </AccountGate>
      </AccountProvider>
    )}
  </React.StrictMode>,
);
