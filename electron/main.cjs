'use strict';

const { app, BrowserWindow, shell, dialog, Menu, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3000', 10);
let serverProcess = null;  // UtilityProcess (Electron's proper Node.js fork)
let mainWindow = null;

// ---------- path helpers ----------
// With asar:false, packaged files live at:
//   {resourcesPath}/app/dist-server/server.js
//   {resourcesPath}/app/frontend/dist/
// In development they're in the project root (one level above this cjs file).

function appRoot() {
  var parts = Array.prototype.slice.call(arguments);
  if (app.isPackaged) {
    return path.join.apply(path, [process.resourcesPath, 'app'].concat(parts));
  }
  return path.join.apply(path, [__dirname, '..'].concat(parts));
}

// ---------- health poll ----------

function waitForServer(maxMs) {
  maxMs = maxMs || 45000;
  return new Promise(function (resolve, reject) {
    var deadline = Date.now() + maxMs;
    function attempt() {
      var req = http.get('http://127.0.0.1:' + PORT + '/api/health', function (res) {
        resolve();
      });
      req.setTimeout(1500, function () { req.destroy(); });
      req.on('error', function () {
        if (Date.now() > deadline) {
          reject(new Error('Server did not respond within ' + maxMs + 'ms'));
        } else {
          setTimeout(attempt, 600);
        }
      });
    }
    attempt();
  });
}

// ---------- start Express server via utilityProcess.fork() ----------
// utilityProcess is Electron's native way to fork a real Node.js process.
// Unlike spawn(process.execPath, ...) it does NOT initialise Chromium / sandbox.

function startServer() {
  var serverEntry = appRoot('dist-server', 'server.js');
  var frontendDist = appRoot('frontend', 'dist');
  var userData = app.getPath('userData');
  var dbPath = path.join(userData, 'app.db');
  var uploadsDir = path.join(userData, 'uploads');
  var backupDir = path.join(userData, 'backup');
  var dataDir = path.join(userData, 'data');

  // Ensure persistent user directories exist
  [uploadsDir, backupDir, dataDir].forEach(function (d) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // Seed the DB from the bundled copy on first run
  var bundledDb = appRoot('data', 'app.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) {
    try { fs.copyFileSync(bundledDb, dbPath); } catch (e) { /* non-fatal */ }
  }

  // Verify server entry exists (catches packaging errors immediately)
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      'Packaging Error',
      'Server entry not found at:\n' + serverEntry +
      '\n\nThis is a build issue — please report it.'
    );
    app.quit();
    return;
  }

  var env = Object.assign({}, process.env, {
    // NODE_ENV stays 'development' — the server forbids SKIP_AUTH in production mode.
    // A local desktop app doesn't need the server-deployment security restriction.
    // ELECTRON=true is what triggers static-file serving for the React frontend.
    NODE_ENV: 'development',
    PORT: String(PORT),
    SKIP_AUTH: 'true',
    ELECTRON: 'true',
    FRONTEND_DIST: frontendDist,
    DB_PATH: dbPath,
    UPLOADS_DIR: uploadsDir,
    BACKUP_DIR: backupDir,
    DATA_DIR: dataDir,
  });

  console.log('[Electron] Starting server via utilityProcess.fork()');
  console.log('[Electron]   entry :', serverEntry);
  console.log('[Electron]   db    :', dbPath);
  console.log('[Electron]   fe    :', frontendDist);

  serverProcess = utilityProcess.fork(serverEntry, [], {
    env: env,
    cwd: appRoot(),
    stdio: 'pipe',
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', function (d) {
      process.stdout.write('[srv] ' + d);
    });
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', function (d) {
      process.stderr.write('[srv] ' + d);
    });
  }

  serverProcess.on('exit', function (code) {
    console.log('[Electron] Server process exited with code', code);
    if (mainWindow && !mainWindow.isDestroyed() && code !== 0 && code !== null) {
      dialog.showErrorBox(
        'Server Crashed',
        'The backend server stopped unexpectedly (exit code ' + code + ').\n' +
        'Please restart AI Pharmacy.'
      );
    }
  });
}

// ---------- browser window ----------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
    title: 'AI Pharmacy',
    backgroundColor: '#0f172a',
  });

  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  mainWindow.once('ready-to-show', function () {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.loadURL('http://127.0.0.1:' + PORT);
  mainWindow.on('closed', function () { mainWindow = null; });
}

// ---------- lifecycle ----------

app.whenReady().then(function () {
  startServer();

  waitForServer(45000)
    .then(function () {
      createWindow();
    })
    .catch(function (err) {
      console.error('[Electron] Server startup timed out:', err.message);
      dialog.showErrorBox(
        'Startup Error',
        'AI Pharmacy could not start the backend server.\n\n' + err.message +
        '\n\nMake sure port ' + PORT + ' is not already in use.'
      );
      app.quit();
    });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', function () {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
