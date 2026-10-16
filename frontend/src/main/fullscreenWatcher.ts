import type { BrowserWindow } from 'electron';

// QUERY_USER_NOTIFICATION_STATE values from shellapi.h. Windows uses the same state to mute
// notifications while games, fullscreen video, or presentations are running.
const QUNS_BUSY = 2;
const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
const QUNS_PRESENTATION_MODE = 4;
const MONITOR_DEFAULTTONEAREST = 2;
const CHECK_INTERVAL_MS = 1000;

interface Rect { left: number; top: number; right: number; bottom: number }

type FullscreenDetector = (avatarHwnd: number) => boolean;

const loadDetector = (): FullscreenDetector | null => {
  if (process.platform !== 'win32') return null;

  try {
    // Loaded lazily so a missing native binary only disables this feature instead of crashing the app.
    const koffi = require('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    const shell32 = koffi.load('shell32.dll');

    const RECT = koffi.struct('DF_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    const MONITORINFO = koffi.struct('DF_MONITORINFO', {
      cbSize: 'uint32_t',
      rcMonitor: RECT,
      rcWork: RECT,
      dwFlags: 'uint32_t',
    });

    const queryNotificationState = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)');
    const getForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    const getWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *pid)');
    const getWindowRect = user32.func('bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ DF_RECT *rect)');
    const monitorFromWindow = user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hWnd, uint32_t flags)');
    const getMonitorInfo = user32.func('bool __stdcall GetMonitorInfoW(intptr_t hMonitor, _Inout_ DF_MONITORINFO *info)');

    return (avatarHwnd) => {
      const state = [0];
      if (queryNotificationState(state) !== 0) return false;
      if (state[0] === QUNS_RUNNING_D3D_FULL_SCREEN || state[0] === QUNS_PRESENTATION_MODE) return true;
      if (state[0] !== QUNS_BUSY) return false;

      // "Busy" is system-wide; only hide when the fullscreen window covers the monitor the friend is on.
      const foreground = getForegroundWindow() as number;
      if (!foreground) return false;

      const pid = [0];
      getWindowThreadProcessId(foreground, pid);
      if (pid[0] === process.pid) return false;

      const monitor = monitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
      if (monitor !== monitorFromWindow(avatarHwnd, MONITOR_DEFAULTTONEAREST)) return false;

      const emptyRect = { left: 0, top: 0, right: 0, bottom: 0 };
      const info = { cbSize: koffi.sizeof(MONITORINFO), rcMonitor: emptyRect, rcWork: emptyRect, dwFlags: 0 };
      const windowRect: Rect = { ...emptyRect };
      if (!getMonitorInfo(monitor, info) || !getWindowRect(foreground, windowRect)) return false;

      const screen = info.rcMonitor as Rect;
      return windowRect.left <= screen.left && windowRect.top <= screen.top
        && windowRect.right >= screen.right && windowRect.bottom >= screen.bottom;
    };
  } catch (error) {
    console.error('Fullscreen detection is unavailable:', error);
    return null;
  }
};

/**
 * Polls once a second for a fullscreen game, video, or presentation on the friend's monitor.
 * Returns false when detection is not supported on this platform.
 */
export const watchFullscreen = (
  getAvatarWindow: () => BrowserWindow | null,
  onChange: (isFullscreen: boolean) => void,
): boolean => {
  const detect = loadDetector();
  if (!detect) return false;

  let isFullscreen = false;
  setInterval(() => {
    const window = getAvatarWindow();
    if (!window || window.isDestroyed()) return;

    let next = false;
    try {
      next = detect(Number(window.getNativeWindowHandle().readBigUInt64LE(0)));
    } catch (error) {
      console.error('Fullscreen check failed:', error);
    }
    if (next !== isFullscreen) {
      isFullscreen = next;
      onChange(isFullscreen);
    }
  }, CHECK_INTERVAL_MS);
  return true;
};
