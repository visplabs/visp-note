// Starts the unpacked Linux package once, on a throwaway home, and checks that it
// reaches a ready window and can search. Build it first with:
//   npx electron-builder --linux dir --x64 --publish never
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BOOT_TIMEOUT_MS = 60000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function packagedExecutable(root = ROOT) {
  const executable = path.join(root, 'dist', 'linux-unpacked', 'vispnote');
  if (!fs.existsSync(executable)) throw new Error(`No unpacked Linux package at ${path.relative(root, executable)}`);
  return executable;
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

function devToolsPort(configHome) {
  const file = findFile(configHome, 'DevToolsActivePort');
  const port = file ? Number.parseInt(fs.readFileSync(file, 'utf8').split('\n')[0], 10) : Number.NaN;
  return Number.isInteger(port) && port > 0 ? port : null;
}

async function pageSocket(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(target => target.type === 'page');
  if (!page) return null;
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return socket;
}

function evaluate(socket, expression) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
      else resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

const READY_STATE = `(() => {
  const root = document.querySelector('#root');
  const splash = document.querySelector('.mn-boot-splash');
  const text = document.body?.textContent || '';
  return {
    ready: Boolean(root?.children.length) && !(splash && text.includes('Opening vault and indexing notes')),
    failed: Boolean(splash) && text.includes('Launch interrupted'),
  };
})()`;

const SEARCH_CHECK = `(async () => {
  const vaults = await window.mn.vaults.listVaults();
  const vaultId = (vaults.value || vaults.data?.vaults || [])[0]?.id;
  const prefs = await window.mn.preferences.getPrefs();
  const search = await window.mn.search.search(vaultId, 'Welcome', 5);
  return { vaultId, searchOk: search.ok === true, results: (search.value || []).length, error: search.error || null,
    searchIndexProblem: (prefs.value || prefs).searchIndexProblem || null };
})()`;

async function waitForReadyPage(configHome, child) {
  const started = Date.now();
  while (Date.now() - started < BOOT_TIMEOUT_MS) {
    if (child.exitCode !== null) throw new Error(`Packaged app exited during start-up with code ${child.exitCode}`);
    const port = devToolsPort(configHome);
    const socket = port ? await pageSocket(port).catch(() => null) : null;
    if (socket) {
      const state = await evaluate(socket, READY_STATE).catch(() => null);
      if (state?.failed) throw new Error('Packaged app showed "Launch interrupted"');
      if (state?.ready) return socket;
      socket.close();
    }
    await wait(500);
  }
  throw new Error('Packaged app did not reach a ready window');
}

async function checkPackagedApp(executable = packagedExecutable()) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vispnote-packaged-'));
  const configHome = path.join(home, 'config');
  fs.mkdirSync(configHome);
  const output = [];
  const child = childProcess.spawn(executable, ['--no-sandbox', '--password-store=basic', '--remote-debugging-port=0'], {
    env: {
      ...process.env,
      APPIMAGE: '',
      VISPNOTE_HOME: path.join(home, 'data'),
      XDG_CONFIG_HOME: configHome,
      VISPNOTE_DISABLE_GLOBAL_SHORTCUTS: '1',
      VISPNOTE_DISABLE_SAFE_STORAGE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => output.push(String(chunk)));
  child.stderr.on('data', chunk => output.push(String(chunk)));
  try {
    const socket = await waitForReadyPage(configHome, child);
    const result = await evaluate(socket, SEARCH_CHECK);
    socket.close();
    if (!result.searchOk || result.results < 1) throw new Error(`Search failed in the packaged app: ${JSON.stringify(result)}`);
    if (result.searchIndexProblem) throw new Error(`Packaged app reported: ${result.searchIndexProblem.title}`);
    return result;
  } catch (error) {
    error.message += `\n--- packaged app output ---\n${output.join('').slice(-4000)}`;
    throw error;
  } finally {
    child.kill('SIGTERM');
    await wait(1000);
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (require.main === module) {
  checkPackagedApp().then(result => {
    console.log(`Packaged app reached a ready window and found ${result.results} search result(s).`);
  }).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { checkPackagedApp, devToolsPort, packagedExecutable };
