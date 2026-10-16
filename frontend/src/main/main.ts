import { app, BrowserWindow, ipcMain, Menu, powerMonitor, screen, Tray, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { avatarDimensions, avatarSizes, isAvatarSize } from '../shared/avatarSize';
import { activities, characters, hasGesture, isActivity, isCharacterId } from '../shared/characters';
import { isDuration, isTimeOfDay, postureTimeline } from '../shared/posture';
import { PRESENCE_HEARTBEAT_MS, PRESENCE_IDLE_SECONDS } from '../shared/social';
import type { CompanionSettings, CompanionSettingsUpdate, PostureTimer, PresenceStatus } from '../shared/types';
import { canRememberSession, clearRememberedSession, readRememberedSession, writeRememberedSession } from './authStore';
import { watchFullscreen } from './fullscreenWatcher';
import { loadSettings, saveSettings } from './settings';
import { createTrayIcon, createWindowIcon } from './trayIcon';

const AVATAR_SCREEN_MARGIN = 24;
// On Windows, Electron's default "floating" level parks the window just behind the taskbar. While a
// fullscreen app is active the taskbar is not topmost, so the avatar silently loses its topmost flag
// and ends up behind every window. "screen-saver" skips that taskbar placement.
const AVATAR_ON_TOP_LEVEL = process.platform === 'win32' ? 'screen-saver' : 'floating';
const AVATAR_ON_TOP_CHECK_MS = 2000;
// Postures switch on a timer set for the exact end of each phase; this check only catches clock jumps.
const POSTURE_SAFETY_CHECK_MS = 30_000;
const IDLE_CHECK_MS = 10_000;
// How long quitting waits for the main window to report the user offline.
const QUIT_OFFLINE_TIMEOUT_MS = 1500;

let mainWindow: BrowserWindow | null = null;
let avatarWindow: BrowserWindow | null = null;
// The avatar window's size: a share of the screen the friend stands on (see shared/avatarSize).
let avatarSize = { width: 0, height: 0 };
let tray: Tray | null = null;
let settings: CompanionSettings;
let isQuitting = false;
let isFullscreenAppActive = false;
let canDetectFullscreen = false;
// The friend only appears on the desktop while someone is logged in (reported by the main window).
let isSignedIn = false;
// Opening the app counts as an interaction, so the friend starts out waving.
let lastInteractionAt = Date.now();
let postureTimer: PostureTimer = { posture: 'waving', endsAt: null };
let postureTimeout: NodeJS.Timeout | null = null;
// Whether the user has stepped away from the computer (no input for a while, or the screen is locked).
let isUserIdle = false;
let hasReportedOfflineForQuit = false;

const startHidden = process.argv.includes('--hidden');

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

const loadRenderer = (window: BrowserWindow, hash?: string): void => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(hash ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#${hash}` : MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      hash ? { hash } : undefined,
    );
  }
};

const updateSettings = (patch: Partial<CompanionSettings>): void => {
  const previous = settings;
  settings = { ...settings, ...patch };
  saveSettings(settings);

  if (settings.characterId !== previous.characterId) {
    tray?.setImage(createTrayIcon(settings.characterId));
    mainWindow?.setIcon(createWindowIcon(settings.characterId));
  }
  if (settings.alwaysOnTop !== previous.alwaysOnTop) {
    avatarWindow?.setAlwaysOnTop(settings.alwaysOnTop, AVATAR_ON_TOP_LEVEL);
  }
  if (settings.avatarVisible !== previous.avatarVisible || settings.hideInFullscreen !== previous.hideInFullscreen) {
    syncAvatarVisibility();
  }
  if (settings.avatarSize !== previous.avatarSize) fitAvatarToScreen();

  for (const window of [mainWindow, avatarWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('settings:changed', settings);
  }
  refreshTrayMenu();

  // A newly picked character arrives waving.
  if (settings.characterId !== previous.characterId) lastInteractionAt = Date.now();
  if (
    settings.characterId !== previous.characterId
    || settings.autoPosture !== previous.autoPosture
    || settings.idleSeconds !== previous.idleSeconds
    || settings.bedtime !== previous.bedtime
    || settings.wakeTime !== previous.wakeTime
    || settings.studySeconds !== previous.studySeconds
    || settings.breakSeconds !== previous.breakSeconds
  ) {
    refreshPosture();
  }
};

// ---------------------------------------------------------------------------
// Automatic posture: waving after an interaction, then studying, or sleeping late at night.
// ---------------------------------------------------------------------------

const publishTimer = (timer: PostureTimer): void => {
  if (timer.posture === postureTimer.posture && timer.endsAt === postureTimer.endsAt) return;
  postureTimer = timer;
  for (const window of [mainWindow, avatarWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('posture:timer', postureTimer);
  }
};

const refreshPosture = (): void => {
  if (postureTimeout) clearTimeout(postureTimeout);
  postureTimeout = null;
  if (!settings.autoPosture) {
    publishTimer({ posture: settings.activity, endsAt: null });
    return;
  }
  const timeline = postureTimeline(new Date(), lastInteractionAt, settings, hasGesture(settings.characterId, 'leave'));
  // Wake up right as this phase ends (a hair after, so the next check lands in the new phase).
  postureTimeout = setTimeout(refreshPosture, Math.max(50, timeline.endsAt - Date.now() + 25));
  publishTimer(timeline);
  if (timeline.posture !== settings.activity) updateSettings({ activity: timeline.posture });
};

const registerInteraction = (): void => {
  lastInteractionAt = Date.now();
  refreshPosture();
};

// ---------------------------------------------------------------------------
// Online status: the main window reports it to Supabase. The main process tells it when the user goes
// idle or comes back, re-sends it as a heartbeat (timers in the hidden main window are throttled), and
// asks it to report offline before the app quits.
// ---------------------------------------------------------------------------

const presenceStatus = (): Exclude<PresenceStatus, 'offline'> => (isUserIdle ? 'idle' : 'online');

const sendPresence = (): void => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('presence:status', presenceStatus());
};

const checkIdle = (): void => {
  const state = powerMonitor.getSystemIdleState(PRESENCE_IDLE_SECONDS);
  const idle = state === 'idle' || state === 'locked';
  if (idle === isUserIdle) return;
  isUserIdle = idle;
  sendPresence();
};

const watchPresence = (): void => {
  setInterval(checkIdle, IDLE_CHECK_MS);
  setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
  powerMonitor.on('lock-screen', checkIdle);
  powerMonitor.on('unlock-screen', checkIdle);
  // After sleep the status went stale; report it straight away.
  powerMonitor.on('resume', () => {
    checkIdle();
    sendPresence();
  });
};

/** Holds the quit until the main window has reported the user offline (or a short timeout passes). */
const reportOfflineBeforeQuit = (event: Electron.Event): void => {
  if (hasReportedOfflineForQuit || !isSignedIn || !mainWindow || mainWindow.isDestroyed()) return;
  event.preventDefault();
  hasReportedOfflineForQuit = true;
  let isDone = false;
  const finish = () => {
    if (isDone) return;
    isDone = true;
    clearTimeout(timeout);
    ipcMain.removeListener('presence:quit-ready', finish);
    app.quit();
  };
  const timeout = setTimeout(finish, QUIT_OFFLINE_TIMEOUT_MS);
  ipcMain.on('presence:quit-ready', finish);
  mainWindow.webContents.send('presence:quitting');
};

// ---------------------------------------------------------------------------
// Main window: closing it only hides it so the companion keeps running.
// ---------------------------------------------------------------------------

// Restore after showing: a window hidden while minimized only reports isMinimized() once visible.
const revealWindow = (window: BrowserWindow): void => {
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
};

const createMainWindow = (reveal: boolean): void => {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'Desktop Friends',
    backgroundColor: '#f5f4ee',
    icon: createWindowIcon(settings.characterId),
    show: false,
    webPreferences,
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    showTrayHintOnce();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.once('ready-to-show', () => {
    if (reveal && mainWindow) revealWindow(mainWindow);
  });
  loadRenderer(mainWindow);
};

const showMainWindow = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(true);
  else revealWindow(mainWindow);
};

const showTrayHintOnce = (): void => {
  if (settings.hasSeenTrayHint || process.platform !== 'win32' || !tray) return;
  tray.displayBalloon({
    iconType: 'info',
    title: 'Desktop Friends is still running',
    content: 'Your friend stays on the desktop. Right-click the tray icon to open the app or quit.',
  });
  updateSettings({ hasSeenTrayHint: true });
};

// ---------------------------------------------------------------------------
// Avatar window: a small transparent, frameless window that lives on the desktop.
// ---------------------------------------------------------------------------

const sizeOnDisplay = (display: Electron.Display): { width: number; height: number } =>
  avatarDimensions(display.workArea, settings.avatarSize);

const defaultAvatarBounds = (): Electron.Rectangle => {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const size = sizeOnDisplay(display);
  return {
    x: workArea.x + workArea.width - size.width - AVATAR_SCREEN_MARGIN,
    y: workArea.y + workArea.height - size.height,
    ...size,
  };
};

const clampToWorkArea = (bounds: Electron.Rectangle, workArea: Electron.Rectangle): Electron.Rectangle => ({
  ...bounds,
  x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width),
  y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - bounds.height),
});

// Falls back to the default corner when the saved spot is on a monitor that is no longer attached.
const resolveAvatarBounds = (): Electron.Rectangle => {
  const saved = settings.avatarPosition;
  if (!saved) return defaultAvatarBounds();

  const display = screen.getDisplayNearestPoint(saved);
  const size = sizeOnDisplay(display);
  const { workArea } = display;
  const centerX = saved.x + size.width / 2;
  const centerY = saved.y + size.height / 2;
  const isVisible = centerX >= workArea.x && centerX <= workArea.x + workArea.width
    && centerY >= workArea.y && centerY <= workArea.y + workArea.height;
  return isVisible ? clampToWorkArea({ ...saved, ...size }, workArea) : defaultAvatarBounds();
};

/**
 * Resizes the friend for the screen it stands on, keeping its feet in the same spot. Runs when the
 * size setting or a screen changes, and after the friend is dragged onto another monitor.
 */
const fitAvatarToScreen = (): void => {
  if (!avatarWindow || avatarWindow.isDestroyed()) return;
  const current = avatarWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const size = sizeOnDisplay(display);
  if (size.width === avatarSize.width && size.height === avatarSize.height) return;

  const feetX = current.x + current.width / 2;
  const feetY = current.y + current.height;
  const bounds = clampToWorkArea(
    { x: Math.round(feetX - size.width / 2), y: Math.round(feetY - size.height), ...size },
    display.workArea,
  );
  avatarSize = size;
  avatarWindow.setBounds(bounds);
  updateSettings({ avatarPosition: { x: bounds.x, y: bounds.y } });
};

const createAvatarWindow = (): BrowserWindow => {
  const bounds = resolveAvatarBounds();
  avatarSize = { width: bounds.width, height: bounds.height };
  const window = new BrowserWindow({
    ...bounds,
    title: 'Desktop Friends avatar',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    webPreferences,
  });

  window.setAlwaysOnTop(settings.alwaysOnTop, AVATAR_ON_TOP_LEVEL);

  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    updateSettings({ avatarVisible: false });
  });
  window.on('closed', () => { avatarWindow = null; });
  // Keep the distinct title instead of the page's <title> so the two windows are distinguishable.
  window.on('page-title-updated', (event) => event.preventDefault());
  window.once('ready-to-show', () => {
    if (shouldShowAvatar()) window.showInactive();
  });
  loadRenderer(window, 'avatar');
  return window;
};

// Windows can still strip the topmost flag in other ways (e.g. other apps forcing their own z-order),
// so re-assert it periodically. This is a single SetWindowPos call and does not steal focus.
const keepAvatarOnTop = (): void => {
  if (process.platform !== 'win32') return;
  setInterval(() => {
    if (!settings.alwaysOnTop || !avatarWindow || avatarWindow.isDestroyed() || !avatarWindow.isVisible()) return;
    avatarWindow.setAlwaysOnTop(true, AVATAR_ON_TOP_LEVEL);
  }, AVATAR_ON_TOP_CHECK_MS);
};

const shouldShowAvatar = (): boolean =>
  isSignedIn && settings.avatarVisible && !(settings.hideInFullscreen && isFullscreenAppActive);

const syncAvatarVisibility = (): void => {
  if (!isSignedIn) {
    // Nobody is logged in: no friend on the desktop at all until someone logs in.
    if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.destroy();
    avatarWindow = null;
    return;
  }
  if (!avatarWindow || avatarWindow.isDestroyed()) {
    // The window is created even while it should stay hidden: fullscreen detection needs its monitor.
    if (settings.avatarVisible) avatarWindow = createAvatarWindow();
    return;
  }
  if (shouldShowAvatar()) avatarWindow.showInactive();
  else avatarWindow.hide();
};

const resetAvatarPosition = (): void => {
  const bounds = defaultAvatarBounds();
  avatarSize = { width: bounds.width, height: bounds.height };
  avatarWindow?.setBounds(bounds);
  updateSettings({ avatarPosition: null, avatarVisible: true });
};

const setSignedIn = (signedIn: boolean): void => {
  if (signedIn === isSignedIn) return;
  isSignedIn = signedIn;
  // Logging in counts as an interaction, so the friend arrives waving.
  if (signedIn) registerInteraction();
  syncAvatarVisibility();
  refreshTrayMenu();
};

// ---------------------------------------------------------------------------
// Tray icon and the shared menu (also shown when right-clicking the avatar).
// ---------------------------------------------------------------------------

const canLaunchAtLogin = (): boolean => app.isPackaged && process.platform !== 'linux';

const buildMenuTemplate = (): MenuItemConstructorOptions[] => [
  { label: isSignedIn ? 'Open Desktop Friends' : 'Log in to Desktop Friends', click: showMainWindow },
  { type: 'separator' },
  {
    label: 'Show friend on desktop',
    type: 'checkbox',
    enabled: isSignedIn,
    checked: settings.avatarVisible,
    click: (item) => updateSettings({ avatarVisible: item.checked }),
  },
  {
    label: 'Show timer above friend',
    type: 'checkbox',
    checked: settings.showTimer,
    click: (item) => updateSettings({ showTimer: item.checked }),
  },
  {
    label: 'Size',
    submenu: avatarSizes.map((size): MenuItemConstructorOptions => ({
      label: size.label,
      type: 'radio',
      checked: settings.avatarSize === size.value,
      click: () => updateSettings({ avatarSize: size.value }),
    })),
  },
  {
    label: 'Keep on top of other windows',
    type: 'checkbox',
    checked: settings.alwaysOnTop,
    click: (item) => updateSettings({ alwaysOnTop: item.checked }),
  },
  {
    label: 'Hide during fullscreen games and videos',
    type: 'checkbox',
    visible: canDetectFullscreen,
    checked: settings.hideInFullscreen,
    click: (item) => updateSettings({ hideInFullscreen: item.checked }),
  },
  {
    label: 'Character',
    submenu: characters.map((character) => ({
      label: character.name,
      type: 'radio',
      checked: settings.characterId === character.id,
      click: () => updateSettings({ characterId: character.id }),
    })),
  },
  {
    label: 'Animation',
    submenu: [
      {
        label: 'Automatic',
        type: 'radio',
        checked: settings.autoPosture,
        click: () => updateSettings({ autoPosture: true }),
      },
      ...activities.map((activity): MenuItemConstructorOptions => ({
        label: activity.label,
        type: 'radio',
        checked: !settings.autoPosture && settings.activity === activity.value,
        click: () => updateSettings({ autoPosture: false, activity: activity.value }),
      })),
    ],
  },
  { label: 'Move friend back to corner', enabled: isSignedIn, click: resetAvatarPosition },
  { type: 'separator' },
  {
    label: process.platform === 'darwin' ? 'Open at login' : 'Start with Windows',
    type: 'checkbox',
    visible: canLaunchAtLogin(),
    checked: canLaunchAtLogin() && app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin,
    click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
  },
  { label: 'Quit Desktop Friends', click: () => app.quit() },
];

const refreshTrayMenu = (): void => {
  tray?.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
};

const createTray = (): void => {
  tray = new Tray(createTrayIcon(settings.characterId));
  tray.setToolTip('Desktop Friends');
  tray.on('click', showMainWindow);
  refreshTrayMenu();
};

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

const registerIpc = (): void => {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('posture:get-timer', () => postureTimer);

  ipcMain.on('settings:update', (_event, patch: CompanionSettingsUpdate) => {
    if (typeof patch !== 'object' || patch === null) return;
    const accepted: CompanionSettingsUpdate = {};
    if (isCharacterId(patch.characterId)) accepted.characterId = patch.characterId;
    if (isActivity(patch.activity)) accepted.activity = patch.activity;
    if (typeof patch.autoPosture === 'boolean') accepted.autoPosture = patch.autoPosture;
    // Picking a specific animation pins it until automatic posture is turned back on.
    else if (accepted.activity) accepted.autoPosture = false;
    if (isDuration('idleSeconds', patch.idleSeconds)) accepted.idleSeconds = patch.idleSeconds;
    if (isTimeOfDay(patch.bedtime)) accepted.bedtime = patch.bedtime;
    if (isTimeOfDay(patch.wakeTime)) accepted.wakeTime = patch.wakeTime;
    if (isDuration('studySeconds', patch.studySeconds)) accepted.studySeconds = patch.studySeconds;
    if (isDuration('breakSeconds', patch.breakSeconds)) accepted.breakSeconds = patch.breakSeconds;
    if (typeof patch.showTimer === 'boolean') accepted.showTimer = patch.showTimer;
    if (typeof patch.avatarVisible === 'boolean') accepted.avatarVisible = patch.avatarVisible;
    if (isAvatarSize(patch.avatarSize)) accepted.avatarSize = patch.avatarSize;
    if (typeof patch.alwaysOnTop === 'boolean') accepted.alwaysOnTop = patch.alwaysOnTop;
    if (typeof patch.hideInFullscreen === 'boolean') accepted.hideInFullscreen = patch.hideInFullscreen;
    updateSettings(accepted);
  });

  ipcMain.on('avatar:move', (event, x: unknown, y: unknown) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // setBounds instead of setPosition: on Windows with display scaling, setPosition can slowly grow the window.
    avatarWindow.setBounds({ x: Math.round(x), y: Math.round(y), ...avatarSize });
  });

  ipcMain.on('avatar:drag-end', (event) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    const [x, y] = avatarWindow.getPosition();
    updateSettings({ avatarPosition: { x, y } });
    fitAvatarToScreen();
  });

  // Touching the friend on the desktop or in the app's preview.
  ipcMain.on('avatar:interact', registerInteraction);

  ipcMain.on('avatar:context-menu', (event) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: avatarWindow });
  });

  ipcMain.on('app:open-main-window', showMainWindow);

  // Remembered sign-in: only the main window (where accounts live) may touch it.
  const fromMainWindow = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
  ipcMain.handle('auth-store:can-remember', () => canRememberSession());
  ipcMain.handle('auth-store:read', (event) => (fromMainWindow(event) ? readRememberedSession() : null));
  ipcMain.on('auth-store:write', (event, items: unknown) => {
    if (fromMainWindow(event)) writeRememberedSession(items);
  });
  ipcMain.on('auth-store:clear', (event) => {
    if (fromMainWindow(event)) clearRememberedSession();
  });
  ipcMain.on('account:signed-in', (event, signedIn: unknown) => {
    if (fromMainWindow(event) && typeof signedIn === 'boolean') setSignedIn(signedIn);
  });
  ipcMain.handle('presence:get', () => presenceStatus());
};

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.desktopfriends.app');
    settings = loadSettings();
    refreshPosture();
    setInterval(refreshPosture, POSTURE_SAFETY_CHECK_MS);
    powerMonitor.on('resume', refreshPosture);

    registerIpc();
    watchPresence();
    canDetectFullscreen = watchFullscreen(() => avatarWindow, (isFullscreen) => {
      isFullscreenAppActive = isFullscreen;
      syncAvatarVisibility();
    });
    createTray();
    keepAvatarOnTop();
    screen.on('display-metrics-changed', fitAvatarToScreen);
    screen.on('display-added', fitAvatarToScreen);
    screen.on('display-removed', fitAvatarToScreen);
    // The friend appears once the main window reports a signed-in account. Started with Windows, a
    // remembered sign-in is restored in a hidden main window so the friend still shows up on its own.
    if (!startHidden) showMainWindow();
    else if (readRememberedSession()) createMainWindow(false);

    app.on('activate', showMainWindow);
  });

  app.on('before-quit', (event) => {
    isQuitting = true;
    reportOfflineBeforeQuit(event);
  });

  // Keep running in the tray when every window is closed or hidden.
  app.on('window-all-closed', () => undefined);
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
