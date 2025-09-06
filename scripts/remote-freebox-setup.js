// scripts/remote-freebox-setup.js
// Remote Freebox bootstrap: connects via SSH, installs deps, uploads project, sets fonts/env, tests cards, and optionally starts PM2

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = process.env.FBX_HOST || '127.0.0.1';
const PORT = Number(process.env.FBX_PORT || 22);
const USER = process.env.FBX_USER || 'Freebox';
const PASS = process.env.FBX_PASS || '';
const USE_PM2 = String(process.env.FBX_PM2 || 'true').toLowerCase() === 'true';
const LOCAL_TARBALL = process.env.FBX_TARBALL || path.resolve('/workspace/bot.tar.gz');

const REM_TMP_TARBALL = '/tmp/bot.tar.gz';
const BOT_USER = 'botuser';
const BOT_DIR = `/home/${BOT_USER}/bag-discord-bot`;

function log(msg, ...args) { console.log(`[remote-setup] ${msg}`, ...args); }
function err(msg, ...args) { console.error(`[remote-setup] ${msg}`, ...args); }

function connectSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect({
      host: HOST,
      port: PORT,
      username: USER,
      password: PASS,
      tryKeyboard: false,
      readyTimeout: 20000,
      hostVerifier: () => true,
    });
  });
}

function exec(conn, command, { useSudo = false, sudoPassword = PASS, timeoutMs = 600000 } = {}) {
  const cmd = useSudo ? `sudo -n bash -lc ${JSON.stringify(command)}` : `bash -lc ${JSON.stringify(command)}`;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reject(new Error(`Timeout executing: ${command}`)); }, timeoutMs);
    conn.exec(cmd, (e, stream) => {
      if (e) { clearTimeout(timer); return reject(e); }
      stream.on('close', (code) => {
        clearTimeout(timer);
        // If sudo -n failed due to password requirement, retry with -S
        if (useSudo && code !== 0 && /password is required|a password is required|sudo: a terminal is required/i.test(stderr)) {
          return execWithSudoStdin(conn, command, sudoPassword, timeoutMs).then(resolve).catch(reject);
        }
        resolve({ code, stdout, stderr });
      }).on('data', (data) => { stdout += data.toString(); }).stderr.on('data', (data) => { stderr += data.toString(); });
    });
  });
}

function execWithSudoStdin(conn, command, sudoPassword = PASS, timeoutMs = 600000) {
  const sudoCmd = `sudo -S -p "" bash -lc ${JSON.stringify(command)}`;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reject(new Error(`Timeout executing (sudo -S): ${command}`)); }, timeoutMs);
    conn.exec(sudoCmd, (e, stream) => {
      if (e) { clearTimeout(timer); return reject(e); }
      // Write password once to stdin for sudo -S (no prompt)
      try { stream.write(`${sudoPassword}\n`); } catch (_) {}
      stream.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }).on('data', (data) => { stdout += data.toString(); }).stderr.on('data', (data) => { stderr += data.toString(); });
    });
  });
}

function sftpUpload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((e, sftp) => {
      if (e) return reject(e);
      const read = fs.createReadStream(localPath);
      const write = sftp.createWriteStream(remotePath);
      write.on('close', () => resolve());
      write.on('error', reject);
      read.on('error', reject);
      read.pipe(write);
    });
  });
}

async function main() {
  if (!fs.existsSync(LOCAL_TARBALL)) {
    throw new Error(`Local tarball not found: ${LOCAL_TARBALL}`);
  }
  log(`Connecting to ${HOST}:${PORT} as ${USER}...`);
  const conn = await connectSSH();
  log('Connected. Performing setup...');
  try {
    // Basic check
    const id = await exec(conn, 'whoami');
    log(`Remote user: ${id.stdout.trim()}`);

    // Update and install system deps for canvas
    log('Installing system dependencies...');
    const sys = await exec(conn, 'apt-get update -y && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev git curl wget', { useSudo: true });
    if (sys.code !== 0) err('System deps stderr:', sys.stderr);

    // Ensure bot user and directories
    await exec(conn, `id ${BOT_USER} || useradd -m -s /bin/bash ${BOT_USER}`, { useSudo: true });
    await exec(conn, `mkdir -p ${BOT_DIR} ${BOT_DIR}/logs ${BOT_DIR}/data`, { useSudo: true });

    // Upload tarball to /tmp and extract into BOT_DIR
    log('Uploading project tarball...');
    await sftpUpload(conn, LOCAL_TARBALL, REM_TMP_TARBALL);
    log('Extracting project on remote...');
    const ext = await exec(conn, `tar -xzf ${REM_TMP_TARBALL} -C ${BOT_DIR} --strip-components=0`, { useSudo: true });
    if (ext.code !== 0) err('Tar extract stderr:', ext.stderr);
    await exec(conn, `chown -R ${BOT_USER}:${BOT_USER} ${BOT_DIR}`, { useSudo: true });

    // Install npm deps (production)
    log('Installing npm dependencies (production)...');
    const npm = await exec(conn, `bash -lc "cd ${BOT_DIR} && npm install --production --silent"`, { useSudo: true });
    if (npm.code !== 0) err('npm stderr:', npm.stderr);

    // Fonts
    log('Installing fonts...');
    await exec(conn, `bash -lc "mkdir -p ${BOT_DIR}/assets/fonts && wget -qO ${BOT_DIR}/assets/fonts/Cinzel-VariableFont_wght.ttf https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-VariableFont_wght.ttf && wget -qO ${BOT_DIR}/assets/fonts/CormorantGaramond-SemiBold.ttf https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-SemiBold.ttf"`, { useSudo: true });

    // Env: LEVEL_CARD_LOGO_URL
    log('Setting LEVEL_CARD_LOGO_URL...');
    await exec(conn, `bash -lc "touch ${BOT_DIR}/.env && grep -q '^LEVEL_CARD_LOGO_URL=' ${BOT_DIR}/.env || echo 'LEVEL_CARD_LOGO_URL=${BOT_DIR}/Bag.png' >> ${BOT_DIR}/.env"`, { useSudo: true });
    await exec(conn, `chown ${BOT_USER}:${BOT_USER} ${BOT_DIR}/.env && chmod 600 ${BOT_DIR}/.env`, { useSudo: true });

    // Test render cards
    log('Rendering test cards...');
    const test = await exec(conn, `bash -lc "cd ${BOT_DIR} && node test-final-cards.js"`, { useSudo: true });
    if (test.code !== 0) {
      err('Test render failed:', test.stderr);
    } else {
      log('Test render completed. Check output/ directory on remote.');
    }

    if (USE_PM2) {
      log('Installing PM2 and starting app...');
      await exec(conn, `npm install -g pm2 --silent`, { useSudo: true });
      const start = await exec(conn, `bash -lc "cd ${BOT_DIR} && pm2 start ecosystem.config.js --env production && pm2 save"`, { useSudo: true });
      if (start.code !== 0) err('PM2 start stderr:', start.stderr);
      const stat = await exec(conn, `pm2 status | cat`, { useSudo: true });
      log('PM2 status:\n' + stat.stdout);
    }

    log('Remote setup complete.');
  } finally {
    conn.end();
  }
}

main().catch((e) => { err(e.stack || e.message || String(e)); process.exit(1); });

