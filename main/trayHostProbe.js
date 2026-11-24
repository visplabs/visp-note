const STATUS_NOTIFIER_WATCHER = 'org.kde.StatusNotifierWatcher';
const PROBE_TIMEOUT_MS = 2000;

const PROBES = [
  {
    command: 'dbus-send',
    args: [
      '--session', '--print-reply', '--type=method_call', '--dest=org.freedesktop.DBus',
      '/org/freedesktop/DBus', 'org.freedesktop.DBus.NameHasOwner', `string:${STATUS_NOTIFIER_WATCHER}`,
    ],
    found: /boolean true/,
  },
  {
    command: 'gdbus',
    args: [
      'call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus',
      '--method', 'org.freedesktop.DBus.NameHasOwner', STATUS_NOTIFIER_WATCHER,
    ],
    found: /\(true,\)/,
  },
];

function runProbe(execFile, probe) {
  return new Promise(resolve => {
    execFile(probe.command, probe.args, { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      resolve(error ? null : probe.found.test(String(stdout || '')));
    });
  });
}

async function linuxHasStatusNotifierHost(execFile) {
  for (const probe of PROBES) {
    const result = await runProbe(execFile, probe);
    if (result !== null) return result;
  }
  return false;
}

// Electron on Linux shows the tray through a StatusNotifierItem host; without one
// (stock GNOME, for example) the Tray object exists but no icon is ever drawn.
function createTrayHostProbe({ platform, execFile }) {
  return async function detectTrayHost() {
    if (platform !== 'linux') return true;
    return linuxHasStatusNotifierHost(execFile);
  };
}

module.exports = { createTrayHostProbe };
