const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const { createWindowLifecycle } = require('../main/windowLifecycle');
const { createTrayHostProbe } = require('../main/trayHostProbe');

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await flush();
}

function fakeElectron() {
  const ipcMain = new EventEmitter();
  const windows = [];
  const app = { quitCalls: 0, quit() { this.quitCalls += 1; } };

  class FakeWebContents extends EventEmitter {
    constructor() {
      super();
      this.session = {
        setSpellCheckerEnabled() {},
        availableSpellCheckerLanguages: ['en-US'],
        setSpellCheckerLanguages() {},
      };
    }
    isDestroyed() { return false; }
    isLoading() { return false; }
    send(channel, requestId) {
      if (channel === 'mn:flushDirtyNotes') {
        setImmediate(() => ipcMain.emit('mn:flushDirtyNotesResult', { sender: this }, requestId, { ok: true }));
      }
    }
  }

  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = new FakeWebContents();
      this.visible = true;
      this.destroyed = false;
      windows.push(this);
    }
    loadFile() {}
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isMinimized() { return false; }
    hide() { this.visible = false; this.emit('hide'); }
    show() { this.visible = true; this.emit('show'); }
    focus() {}
    close() {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      this.emit('close', event);
      if (!event.defaultPrevented) {
        this.destroyed = true;
        this.emit('closed');
      }
    }
  }

  class FakeTray extends EventEmitter {
    destroy() {}
    setToolTip() {}
    setContextMenu() {}
  }

  return { app, ipcMain, windows, BrowserWindow: FakeWindow, Tray: FakeTray };
}

function lifecycleWith(detectTrayHost, platform = 'linux') {
  const electron = fakeElectron();
  const lifecycle = createWindowLifecycle({
    app: electron.app,
    BrowserWindow: electron.BrowserWindow,
    Menu: { buildFromTemplate: template => template },
    Tray: electron.Tray,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }), createFromDataURL: () => ({}) },
    ipcMain: electron.ipcMain,
    dialog: { showMessageBox: async () => ({}) },
    globalShortcut: { register: () => true },
    path,
    rootDir: '/app',
    appName: 'VispNote',
    iconPath: '/app/icon.png',
    attachEditContextMenu() {},
    hardenWindow() {},
    quitPersistence: { classifyFlushResult: result => ({ ok: result?.ok !== false }), flushFailureDetail: () => '' },
    detectTrayHost,
    platform,
  });
  return { ...electron, lifecycle };
}

async function openApp(detectTrayHost, platform) {
  const harness = lifecycleWith(detectTrayHost, platform);
  harness.lifecycle.createTray();
  const win = harness.lifecycle.createWindow();
  await flush();
  return { ...harness, win };
}

test('closing the window hides it when a tray host is showing the tray icon', async () => {
  const { app, win } = await openApp(async () => true);

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), false);
  assert.equal(win.isVisible(), false);
  assert.equal(app.quitCalls, 0);
});

test('closing the window quits when no tray host exists, so the app is never hidden with no way back', async () => {
  const { app, win } = await openApp(async () => false);

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), true, 'the window must close instead of hiding');
  assert.ok(app.quitCalls >= 1, 'the app must quit');
});

test('closing the window quits when the tray host check fails', async () => {
  const { app, win } = await openApp(async () => { throw new Error('no session bus'); });

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), true);
  assert.ok(app.quitCalls >= 1);
});

function answers(...values) {
  let call = 0;
  return async () => values[Math.min(call++, values.length - 1)];
}

test('a tray host that appears after start-up is found when the window closes', async () => {
  const { app, win } = await openApp(answers(false, true));

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), false);
  assert.equal(win.isVisible(), false, 'the window hides to the tray that is now showing');
  assert.equal(app.quitCalls, 0);
});

test('a tray host that went away after start-up makes closing quit', async () => {
  const { app, win } = await openApp(answers(true, false));

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), true);
  assert.ok(app.quitCalls >= 1);
});

test('closing while the start-up tray check is still running waits for an answer', async () => {
  let resolveStartup;
  let calls = 0;
  const detect = () => {
    calls += 1;
    return calls === 1 ? new Promise(resolve => { resolveStartup = resolve; }) : Promise.resolve(true);
  };
  const { app, win } = await openApp(detect);

  win.close();
  await settle();
  resolveStartup(false);
  await flush();

  assert.equal(win.isDestroyed(), false);
  assert.equal(win.isVisible(), false);
  assert.equal(app.quitCalls, 0);
});

test('on macOS closing the window still hides it, because the Dock brings it back', async () => {
  const { app, win } = await openApp(async () => false, 'darwin');

  win.close();
  await settle();

  assert.equal(win.isDestroyed(), false);
  assert.equal(win.isVisible(), false);
  assert.equal(app.quitCalls, 0);
});

function fakeExecFile(replies) {
  const calls = [];
  const execFile = (command, args, options, callback) => {
    calls.push(command);
    const reply = replies[command];
    if (!reply) callback(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    else callback(null, reply, '');
  };
  return { execFile, calls };
}

test('the Linux tray probe asks the session bus for a StatusNotifier host', async () => {
  const present = fakeExecFile({ 'dbus-send': 'method return\n   boolean true\n' });
  assert.equal(await createTrayHostProbe({ platform: 'linux', execFile: present.execFile })(), true);

  const absent = fakeExecFile({ 'dbus-send': 'method return\n   boolean false\n' });
  assert.equal(await createTrayHostProbe({ platform: 'linux', execFile: absent.execFile })(), false);
});

test('the Linux tray probe falls back to gdbus, and reports no host when neither tool runs', async () => {
  const viaGdbus = fakeExecFile({ gdbus: '(true,)\n' });
  assert.equal(await createTrayHostProbe({ platform: 'linux', execFile: viaGdbus.execFile })(), true);
  assert.deepEqual(viaGdbus.calls, ['dbus-send', 'gdbus']);

  const neither = fakeExecFile({});
  assert.equal(await createTrayHostProbe({ platform: 'linux', execFile: neither.execFile })(), false);
});

test('Windows always has a notification area for the tray icon', async () => {
  const none = fakeExecFile({});
  assert.equal(await createTrayHostProbe({ platform: 'win32', execFile: none.execFile })(), true);
  assert.deepEqual(none.calls, []);
});
