/* jshint esversion: 6 */
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const i18n = require('./i18n');
const PDFKit = require('pdfkit');
const sizeOf = require('image-size');

let win;
let decryptWin;
let webpWin;

const WEBP_TO_JPEG_SCRIPT = `
new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
  };
  img.onerror = () => reject(new Error(__WEBP_ERR__));
  img.src = 'data:image/webp;base64,' + __B64__;
});
`;

function getWebpWindow() {
    if (webpWin && !webpWin.isDestroyed()) {
        return webpWin;
    }
    webpWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    webpWin.loadURL('about:blank');
    return webpWin;
}

function webpToJpegBuffer(filePath) {
    const raw = fs.readFileSync(filePath);
    const b64 = raw.toString('base64');
    const wwin = getWebpWindow();
    const script = WEBP_TO_JPEG_SCRIPT
        .replace('__B64__', JSON.stringify(b64))
        .replace('__WEBP_ERR__', JSON.stringify(i18n.t('errors.webpDecode')));
    return new Promise((resolve) => {
        if (wwin.webContents.isLoading()) {
            wwin.webContents.once('did-finish-load', resolve);
        } else {
            resolve();
        }
    }).then(() => wwin.webContents.executeJavaScript(script))
        .then((jpegB64) => Buffer.from(jpegB64, 'base64'));
}

function imageBufferForPdf(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.webp') {
        return webpToJpegBuffer(filePath);
    }
    return Promise.resolve(fs.readFileSync(filePath));
}

function getImageSize(buffer) {
    const dims = sizeOf(buffer);
    if (!dims || !dims.width || !dims.height) {
        throw new Error(i18n.t('errors.imageSize'));
    }
    return { width: dims.width, height: dims.height };
}

async function buildPdf(imagesTempFolder, pageCount, pdfPath) {
    let doc;
    let writeStream;

    for (let i = 0; i < pageCount; i++) {
        const files = fs.readdirSync(imagesTempFolder).filter((f) => f.startsWith(`${i + 1}.`));
        if (!files.length) {
            throw new Error(i18n.t('errors.downloadedFileMissing', { page: i + 1 }));
        }
        const imgPath = path.join(imagesTempFolder, files[0]);
        const imgBuffer = await imageBufferForPdf(imgPath);
        const imgSize = getImageSize(imgBuffer);

        if (!i) {
            doc = new PDFKit({ size: [imgSize.width, imgSize.height] });
            writeStream = fs.createWriteStream(pdfPath);
            doc.pipe(writeStream);
        } else {
            doc.addPage({ size: [imgSize.width, imgSize.height] });
        }

        doc.image(imgBuffer, 0, 0, {
            fit: [imgSize.width, imgSize.height],
            align: 'center',
            valign: 'center',
        });
        fs.unlinkSync(imgPath);
    }

    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        doc.end();
    });

    try {
        fs.rmdirSync(imagesTempFolder);
    } catch (err) {
        console.warn('Could not remove temp folder:', err.message);
    }
}

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
        width: 620,
        height: 720,
        minWidth: 480,
        minHeight: 560,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    win.loadFile('index.html');
    if (process.env.FLIPHTML5_DEBUG === '1') {
        win.webContents.openDevTools();
    }
    win.on('closed', () => {
        app.quit();
    });
}

ipcMain.on('set-locale', (event, locale) => {
    i18n.setLocale(locale);
});

ipcMain.on('decrypt-fliphtml5', (event, encrypted) => {
    runDecrypt(encrypted)
        .then((decoded) => {
            event.sender.send('decrypt-fliphtml5-reply', null, decoded);
        })
        .catch((err) => {
            event.sender.send('decrypt-fliphtml5-reply', err.message || String(err));
        });
});

ipcMain.on('build-pdf', (event, payload) => {
    const { imagesTempFolder, pageCount, pdfPath } = payload;
    buildPdf(imagesTempFolder, pageCount, pdfPath)
        .then(() => {
            event.sender.send('build-pdf-reply', null, pdfPath);
        })
        .catch((err) => {
            event.sender.send('build-pdf-reply', err.message || String(err));
        });
});

app.on('ready', () => {
    i18n.init();
    getDecryptWindow();
    getWebpWindow();
    createWindow();
});
