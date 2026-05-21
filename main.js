/* jshint esversion: 6 */
const { app, BrowserWindow, ipcMain } = require('electron');

let win;
let decryptWin;

const DECRYPT_SCRIPT = `
new Promise(async (resolve, reject) => {
  function loadScript(src) {
    return new Promise((res, rej) => {
      const base = src.split('?')[0];
      if (document.querySelector('script[src^="' + base + '"]')) return res();
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => res();
      script.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }
  try {
    if (!window.__flipDecryptReady) {
      await loadScript('https://static.fliphtml5.com/resourceFiles/html5_templates/js/jquery-4.0.0.min.js');
      await loadScript('https://static.fliphtml5.com/resourceFiles/html5_templates/js/deString.js');
      await new Promise((res, rej) => {
        const start = Date.now();
        const poll = setInterval(() => {
          if (window.allocateUTF8 && window.Module && window.Module._DeString && window.UTF8ToString) {
            clearInterval(poll);
            window.__flipDecryptReady = true;
            res();
          } else if (Date.now() - start > 20000) {
            clearInterval(poll);
            rej(new Error('Decryption engine timed out'));
          }
        }, 100);
      });
    }
    const inputPtr = window.allocateUTF8(__ENCRYPTED__);
    const outputPtr = window.Module._DeString(inputPtr);
    let decoded = window.UTF8ToString(outputPtr);
    const end = decoded.lastIndexOf(']');
    if (end > 0) decoded = decoded.substring(0, end + 1);
    resolve(decoded);
  } catch (err) {
    reject(err);
  }
});
`;

function getDecryptWindow() {
    if (decryptWin && !decryptWin.isDestroyed()) {
        return decryptWin;
    }
    decryptWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    decryptWin.loadURL('about:blank');
    return decryptWin;
}

function runDecrypt(encrypted) {
    const dwin = getDecryptWindow();
    return new Promise((resolve) => {
        if (dwin.webContents.isLoading()) {
            dwin.webContents.once('did-finish-load', resolve);
        } else {
            resolve();
        }
    }).then(() => {
        const script = DECRYPT_SCRIPT.replace('__ENCRYPTED__', JSON.stringify(encrypted));
        return dwin.webContents.executeJavaScript(script);
    });
}

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    win.loadFile('index.html');
    win.webContents.openDevTools();
    win.on('closed', () => {
        app.quit();
    });
}

ipcMain.on('decrypt-fliphtml5', (event, encrypted) => {
    runDecrypt(encrypted)
        .then((decoded) => {
            event.sender.send('decrypt-fliphtml5-reply', null, decoded);
        })
        .catch((err) => {
            event.sender.send('decrypt-fliphtml5-reply', err.message || String(err));
        });
});

app.on('ready', () => {
    getDecryptWindow();
    createWindow();
});
