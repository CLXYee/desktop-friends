import { app, BrowserWindow, ipcMain, Menu, powerMonitor, screen, Tray, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { activities, characters, hasGesture, isActivity, isCharacterId } from '../shared/characters';
import { isDuration, isTimeOfDay, postureTimeline } from '../shared/posture';
import type { CompanionSettings, CompanionSettingsUpdate, PostureTimer } from '../shared/types';
import { watchFullscreen } from './fullscreenWatcher';
import { loadSettings, saveSettings } from './settings';
import { createTrayIcon, createWindowIcon } from './trayIcon';

const AVATAR_WIDTH = 180;
const AVATAR_HEIGHT = 240;
const AVATAR_SCREEN_MARGIN = 24;
// On Windows, Electron's default "floating" level parks the window just behind the taskbar. While a
// fullscreen app is active the taskbar is not topmost, so the avatar silently loses its topmost flag
// and ends up behind every window. "screen-saver" skips that taskbar placement.
const AVATAR_ON_TOP_LEVEL = process.platform === 'win32' ? 'screen-saver' : 'floating';
const AVATAR_ON_TOP_CHECK_MS = 2000;
// Postures switch on a timer set for the exact end of each phase; this check only catches clock jumps.
const POSTURE_SAFETY_CHECK_MS = 30_000;

let mainWindow: BrowserWindow | null = null;
let avatarWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: CompanionSettings;
let isQuitting = false;
let isFullscreenAppActive = false;
let canDetectFullscreen = false;
// Opening the app counts as an interaction, so the friend starts out waving.
let lastInteractionAt = Date.now();
let postureTimer: PostureTimer = { posture: 'waving', endsAt: null };
let postureTimeout: NodeJS.Timeout | null = null;

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
// Main window: closing it only hides it so the companion keeps running.
// ---------------------------------------------------------------------------

// Restore after showing: a window hidden while minimized only reports isMinimized() once visible.
const revealWindow = (window: BrowserWindow): void => {
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
};

const showMainWindow = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
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
      if (mainWindow) revealWindow(mainWindow);
    });
    loadRenderer(mainWindow);
    return;
  }

  revealWindow(mainWindow);
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

const defaultAvatarPosition = (): { x: number; y: number } => {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - AVATAR_WIDTH - AVATAR_SCREEN_MARGIN,
    y: workArea.y + workArea.height - AVATAR_HEIGHT,
  };
};

// Falls back to the default corner when the saved spot is on a monitor that is no longer attached.
const resolveAvatarPosition = (): { x: number; y: number } => {
  const saved = settings.avatarPosition;
  if (!saved) return defaultAvatarPosition();

  const centerX = saved.x + AVATAR_WIDTH / 2;
  const centerY = saved.y + AVATAR_HEIGHT / 2;
  const isVisible = screen.getAllDisplays().some(({ workArea }) => (
    centerX >= workArea.x && centerX <= workArea.x + workArea.width
    && centerY >= workArea.y && centerY <= workArea.y + workArea.height
  ));
  return isVisible ? saved : defaultAvatarPosition();
};

const createAvatarWindow = (): BrowserWindow => {
  const { x, y } = resolveAvatarPosition();
  const window = new BrowserWindow({
    x,
    y,
    width: AVATAR_WIDTH,
    height: AVATAR_HEIGHT,
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
  settings.avatarVisible && !(settings.hideInFullscreen && isFullscreenAppActive);

const syncAvatarVisibility = (): void => {
  if (!avatarWindow || avatarWindow.isDestroyed()) {
    // The window is created even while it should stay hidden: fullscreen detection needs its monitor.
    if (settings.avatarVisible) avatarWindow = createAvatarWindow();
    return;
  }
  if (shouldShowAvatar()) avatarWindow.showInactive();
  else avatarWindow.hide();
};

const resetAvatarPosition = (): void => {
  const position = defaultAvatarPosition();
  avatarWindow?.setBounds({ ...position, width: AVATAR_WIDTH, height: AVATAR_HEIGHT });
  updateSettings({ avatarPosition: null, avatarVisible: true });
};

// ---------------------------------------------------------------------------
// Tray icon and the shared menu (also shown when right-clicking the avatar).
// ---------------------------------------------------------------------------

const canLaunchAtLogin = (): boolean => app.isPackaged && process.platform !== 'linux';

const buildMenuTemplate = (): MenuItemConstructorOptions[] => [
  { label: 'Open Desktop Friends', click: showMainWindow },
  { type: 'separator' },
  {
    label: 'Show friend on desktop',
    type: 'checkbox',
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
  { label: 'Move friend back to corner', click: resetAvatarPosition },
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
    if (typeof patch.alwaysOnTop === 'boolean') accepted.alwaysOnTop = patch.alwaysOnTop;
    if (typeof patch.hideInFullscreen === 'boolean') accepted.hideInFullscreen = patch.hideInFullscreen;
    updateSettings(accepted);
  });

  ipcMain.on('avatar:move', (event, x: unknown, y: unknown) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // setBounds instead of setPosition: on Windows with display scaling, setPosition can slowly grow the window.
    avatarWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: AVATAR_WIDTH, height: AVATAR_HEIGHT });
  });

  ipcMain.on('avatar:drag-end', (event) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    const [x, y] = avatarWindow.getPosition();
    updateSettings({ avatarPosition: { x, y } });
  });

  // Touching the friend on the desktop or in the app's preview.
  ipcMain.on('avatar:interact', registerInteraction);

  ipcMain.on('avatar:context-menu', (event) => {
    if (!avatarWindow || event.sender !== avatarWindow.webContents) return;
    Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: avatarWindow });
  });

  ipcMain.on('app:open-main-window', showMainWindow);
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
    canDetectFullscreen = watchFullscreen(() => avatarWindow, (isFullscreen) => {
      isFullscreenAppActive = isFullscreen;
      syncAvatarVisibility();
    });
    createTray();
    keepAvatarOnTop();
    syncAvatarVisibility();
    if (!startHidden) showMainWindow();

    app.on('activate', showMainWindow);
  });

  app.on('before-quit', () => { isQuitting = true; });

  // Keep running in the tray when every window is closed or hidden.
  app.on('window-all-closed', () => undefined);
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
