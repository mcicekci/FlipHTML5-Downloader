/* jshint esversion: 6 */

if (typeof require === 'undefined') {
    alert('This app must be run with Electron. From the project folder run: npm install && npm start');
    throw new Error('Node require() is not available in the browser. Use npm start.');
}

const fs = require('fs');
const path = require('path');
const request = require('request');
const { ipcRenderer, shell, remote } = require('electron');
const dialog = remote.dialog;
const i18n = require('./i18n');

const urlInput = document.getElementById('url-input');
const pageFromInput = document.getElementById('page-from');
const pageToInput = document.getElementById('page-to');
const downloadButton = document.getElementById('download-button');
const progressPanel = document.getElementById('progress-panel');
const progressStatus = document.getElementById('progress-status');
const progressFraction = document.getElementById('progress-fraction');
const progressBar = document.getElementById('progress-bar');
const progressDetail = document.getElementById('progress-detail');
const progressTrack = document.querySelector('.progress-track');
const resultPanel = document.getElementById('result-panel');
const resultFilename = document.getElementById('result-filename');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');
const openPdfButton = document.getElementById('open-pdf-button');
const showFolderButton = document.getElementById('show-folder-button');
const saveAsButton = document.getElementById('save-as-button');
const langSelect = document.getElementById('lang-select');

const baseDir = __dirname + '/';
let lastPdfPath = '';
let progressPhase = 'idle';
let progressCurrent = 0;
let progressTotal = 0;



i18n.init();
ipcRenderer.send('set-locale', i18n.getLocale());
if (langSelect) {
    langSelect.value = i18n.getLocale();
    langSelect.addEventListener('change', () => {
        i18n.setLocale(langSelect.value);
        ipcRenderer.send('set-locale', langSelect.value);
        refreshUiLabels();
    });
}
i18n.applyToDocument();

downloadButton.onclick = downloadButtonClicked;
openPdfButton.onclick = () => openPdf(lastPdfPath);
showFolderButton.onclick = () => showPdfInFolder(lastPdfPath);
saveAsButton.onclick = () => savePdfAs(lastPdfPath);



let downloader;

let filename = '';

let length = 0;

let pageUrls = [];
let pageRangeStart = 1;

let imagesTempFolder = baseDir + 'temp/';



function hidePanels() {
    progressPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    errorPanel.classList.add('hidden');
}

function setProgress(phase, current, total, statusText, detailText) {
    progressPhase = phase;
    progressCurrent = current;
    progressTotal = total;
    progressPanel.classList.remove('hidden');
    resultPanel.classList.add('hidden');
    errorPanel.classList.add('hidden');

    progressStatus.textContent = statusText;
    progressDetail.textContent = detailText || '';

    if (total > 0) {
        const pct = Math.min(100, Math.round((current / total) * 100));
        progressBar.style.width = `${pct}%`;
        progressFraction.textContent = `${current} / ${total}`;
        progressTrack.setAttribute('aria-valuenow', String(pct));
    } else {
        progressBar.style.width = '0%';
        progressFraction.textContent = '';
        progressTrack.setAttribute('aria-valuenow', '0');
    }
}

function setDownloadButtonLabel(key) {
    const label = downloadButton.querySelector('.btn-label');
    if (label) {
        label.textContent = i18n.t(key);
    }
}

function refreshUiLabels() {
    i18n.applyToDocument();
    if (!downloadButton.disabled) {
        setDownloadButtonLabel('btn.createPdf');
    } else {
        setDownloadButtonLabel('btn.processing');
    }
}

function showWorking(statusText, detailText) {
    downloadButton.disabled = true;
    setDownloadButtonLabel('btn.processing');
    hidePanels();
    setProgress('working', 0, 0, statusText, detailText);
    progressPanel.classList.remove('hidden');
}

function showSuccess(pdfPath, displayName) {
    lastPdfPath = pdfPath;
    downloadButton.disabled = false;
    setDownloadButtonLabel('btn.createPdf');
    progressPanel.classList.add('hidden');
    errorPanel.classList.add('hidden');
    resultFilename.textContent = displayName;
    resultPanel.classList.remove('hidden');
}

function showError(message) {
    console.error(message);
    downloadButton.disabled = false;
    setDownloadButtonLabel('btn.createPdf');
    progressPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    errorMessage.textContent = message;
    errorPanel.classList.remove('hidden');
}

function openPdf(pdfPath) {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
        showError(i18n.t('errors.pdfNotFound'));
        return;
    }
    shell.openItem(pdfPath);
}

function showPdfInFolder(pdfPath) {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
        showError(i18n.t('errors.pdfNotFound'));
        return;
    }
    shell.showItemInFolder(pdfPath);
}

function savePdfAs(pdfPath) {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
        showError(i18n.t('errors.pdfNotFound'));
        return;
    }
    const dest = dialog.showSaveDialog({
        defaultPath: path.basename(pdfPath),
        filters: [{ name: i18n.t('dialog.savePdf'), extensions: ['pdf'] }],
    });
    if (!dest) {
        return;
    }
    try {
        fs.writeFileSync(dest, fs.readFileSync(pdfPath));
        lastPdfPath = dest;
        resultFilename.textContent = path.basename(dest);
    } catch (err) {
        showError(i18n.t('errors.saveFailed', { message: err.message }));
    }
}

function parsePageRange(totalPages) {
    const fromRaw = (pageFromInput.value || '').trim();
    const toRaw = (pageToInput.value || '').trim();

    if (!fromRaw && !toRaw) {
        return { start: 1, end: totalPages };
    }

    const start = fromRaw ? parseInt(fromRaw, 10) : 1;
    const end = toRaw ? parseInt(toRaw, 10) : totalPages;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) {
        throw new Error(i18n.t('errors.pageNumbersInvalid'));
    }
    if (start > end) {
        throw new Error(i18n.t('errors.pageStartAfterEnd'));
    }
    if (start > totalPages || end > totalPages) {
        throw new Error(i18n.t('errors.pageRangeOutOfBounds', { max: totalPages }));
    }

    return { start, end };
}

function decryptFliphtml5Pages(encrypted) {
    return new Promise((resolve, reject) => {
        ipcRenderer.once('decrypt-fliphtml5-reply', (event, err, decoded) => {
            if (err) {
                reject(new Error(err));
            } else {
                resolve(decoded);
            }
        });
        ipcRenderer.send('decrypt-fliphtml5', encrypted);
    });
}



function fetchText(url) {

    return new Promise((resolve, reject) => {

        request(url, (err, resp, body) => {

            if (err) {

                reject(err);

                return;

            }

            if (!resp || resp.statusCode !== 200) {

                reject(new Error(`HTTP ${resp ? resp.statusCode : 'error'} for ${url}`));

                return;

            }

            resolve(body);

        });

    });

}



function normalizeBookUrl(rawURL) {

    const trimmed = (rawURL || '').trim();

    if (!trimmed) {
        throw new Error(i18n.t('errors.urlEmpty'));
    }

    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    const match = withScheme.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/?/i);

    if (!match) {
        throw new Error(i18n.t('errors.urlFormat'));
    }

    return `${match[1]}/`;

}



function findConfigUrl(html, bookUrl) {

    const match = html.match(/<script[^>]+src=["']([^"']*javascript\/config\.js[^"']*)["']/i);

    if (!match) {

        return `${bookUrl}javascript/config.js`;

    }

    const src = match[1];

    if (/^https?:\/\//i.test(src)) {

        return src;

    }

    if (src.startsWith('//')) {

        return `https:${src}`;

    }

    return new URL(src, bookUrl).href;

}



function parseHtmlConfig(text) {

    let jsonText = text.trim();

    if (jsonText.startsWith('var htmlConfig = ')) {

        jsonText = jsonText.slice('var htmlConfig = '.length);

    }

    if (jsonText.endsWith(';')) {

        jsonText = jsonText.slice(0, -1);

    }

    return JSON.parse(jsonText);

}



function sanitizeFilename(name) {

    return (name || 'flipbook')

        .replace(/[<>:"/\\|?*]/g, '')

        .trim()

        .replace(/\.+$/, '') || 'flipbook';

}



function getPageCount(config) {

    const meta = config.meta || {};

    const bookConfig = config.bookConfig || {};

    const count = meta.pageCount

        || meta.totalPageCount

        || config.totalPageCount

        || config.pageCount

        || (typeof bookConfig === 'object' && (bookConfig.totalPageCount || bookConfig.pageCount));

    if (count) {

        return parseInt(count, 10);

    }

    return null;

}



function getBookTitle(config, html) {

    const meta = config.meta || {};

    const title = meta.title || config.title;

    if (title) {

        return sanitizeFilename(title);

    }

    const legacy = html.match(/[\s\S]*pages:\s*"?(\d+)"?,\s*title:\s*"([^"]+)",/);

    if (legacy) {

        return sanitizeFilename(legacy[2]);

    }

    return 'flipbook';

}



function normalizePagePath(filename) {

    let pagePath = filename.replace(/\\/g, '/').replace(/^\.\//, '');

    if (pagePath.startsWith('/')) {

        pagePath = pagePath.slice(1);

    }

    if (!pagePath.startsWith('files/')) {

        pagePath = `files/large/${pagePath}`;

    }

    return pagePath;

}



function buildPageUrl(bookUrl, filename) {

    if (/^https?:\/\//i.test(filename)) {

        return filename;

    }

    return bookUrl + normalizePagePath(filename);

}



async function resolvePageUrls(bookUrl, config, html) {

    const pagesRaw = config.fliphtml5_pages;



    if (Array.isArray(pagesRaw) && pagesRaw.length && typeof pagesRaw[0] === 'object') {

        return pagesRaw.map((page) => {

            const names = page.n || [];

            return buildPageUrl(bookUrl, names[0] || '');

        }).filter(Boolean);

    }



    if (typeof pagesRaw === 'string' && pagesRaw.length > 0) {

        const decoded = await decryptFliphtml5Pages(pagesRaw);

        const pages = JSON.parse(decoded);

        if (!Array.isArray(pages)) {
            throw new Error(i18n.t('errors.decryptInvalid'));
        }

        return pages.map((page) => {

            const names = page.n || [];

            return buildPageUrl(bookUrl, names[0] || '');

        }).filter(Boolean);

    }



    const legacy = html.match(/[\s\S]*pages:\s*"?(\d+)"?,\s*title:\s*"([^"]+)",/);

    if (legacy) {

        const pageCount = parseInt(legacy[1], 10);

        const hostMatch = bookUrl.match(/^https?:\/\/([^/]+)\/(.+)$/i);

        if (!hostMatch) {
            throw new Error(i18n.t('errors.legacyUrls'));
        }

        const legacyBase = `http://online.${hostMatch[1]}/${hostMatch[2]}files/large/`;

        const urls = [];

        for (let i = 1; i <= pageCount; i++) {

            urls.push(`${legacyBase}${i}.jpg`);

        }

        return urls;

    }



    throw new Error(i18n.t('errors.pagesNotFound'));
}



function buildPdfViaMain(imagesTempFolder, pageCount, pdfPath) {
    return new Promise((resolve, reject) => {
        ipcRenderer.once('build-pdf-reply', (event, err) => {
            if (err) {
                reject(new Error(err));
            } else {
                resolve(pdfPath);
            }
        });
        ipcRenderer.send('build-pdf', { imagesTempFolder, pageCount, pdfPath });
    });
}

async function downloadButtonClicked() {

    hidePanels();
    ipcRenderer.send('set-locale', i18n.getLocale());
    showWorking(i18n.t('progress.fetchingBook'), i18n.t('progress.validatingUrl'));

    try {

        const bookUrl = normalizeBookUrl(urlInput.value);

        const html = await fetchText(bookUrl);

        const configUrl = findConfigUrl(html, bookUrl);

        const configText = await fetchText(configUrl);

        const config = parseHtmlConfig(configText);



        length = getPageCount(config);

        if (!length) {
            throw new Error(i18n.t('errors.pageCountUnknown'));
        }



        filename = `${getBookTitle(config, html)}.pdf`;

        pageUrls = await resolvePageUrls(bookUrl, config, html);

        if (!pageUrls.length) {
            throw new Error(i18n.t('errors.noPageUrls'));
        }

        const totalPages = Math.min(length, pageUrls.length);
        const range = parsePageRange(totalPages);
        pageRangeStart = range.start;
        pageUrls = pageUrls.slice(range.start - 1, range.end);
        length = pageUrls.length;

        const titleBase = sanitizeFilename(path.basename(filename, '.pdf'));
        if (range.start !== 1 || range.end !== totalPages) {
            filename = `${titleBase}_s${range.start}-${range.end}.pdf`;
        }

        console.log(`Book URL - ${bookUrl}`);
        console.log(`Pages - ${range.start}–${range.end} (${length} of ${totalPages})`);
        console.log(`Filename - ${filename}`);

        setProgress(
            'download',
            0,
            length,
            i18n.t('progress.downloadingPages'),
            i18n.t('progress.pagesToDownload', { count: length })
        );

        imagesTempFolder = baseDir + titleBase + '/';

        if (!fs.existsSync(imagesTempFolder)) {
            fs.mkdirSync(imagesTempFolder);
        }

        downloader = downloadAll(pageUrls);

        downloader.next();

    } catch (err) {

        showError(err.message || String(err));

    }

}



let done = false;



function* downloadAll(urls) {

    done = false;
    downloadedCount = 0;

    for (let i = 0; i < urls.length; i++) {

        const url = urls[i];

        const ext = path.extname(url.split('?')[0]) || '.jpg';

        const outName = `${i + 1}${ext}`;

        console.log(`Downloading page ${pageRangeStart + i} (${i + 1}/${urls.length})`);

        yield download(url, outName);

    }

}



let downloadedCount = 0;

function download(url, outName) {

    const pageIndex = downloadedCount + 1;

    request(url).pipe(fs.createWriteStream(imagesTempFolder + outName)).on('close', () => {

        if (!done) {

            downloadedCount += 1;
            setProgress(
                'download',
                downloadedCount,
                length,
                i18n.t('progress.downloadingPages'),
                i18n.t('progress.pageDownloaded', {
                    page: pageRangeStart + downloadedCount - 1,
                    current: downloadedCount,
                    total: length,
                })
            );

            const resp = downloader.next();

            done = resp.done;

            if (done) {

                console.log('Done downloading.');

                convertToPDF().catch((err) => {

                    showError(err.message || String(err));

                });

            }

        }

    }).on('error', (err) => {

        showError(i18n.t('errors.downloadFailed', { message: err.message }));

    });

}



async function convertToPDF() {

    console.log('Creating the PDF');
    setProgress('pdf', 0, length, i18n.t('progress.creatingPdf'), i18n.t('progress.mergingPages'));

    const pdfPath = baseDir + filename;
    await buildPdfViaMain(imagesTempFolder, length, pdfPath);

    console.log('Done creating PDF');
    showSuccess(pdfPath, filename);

}

