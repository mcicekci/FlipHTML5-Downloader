/* jshint esversion: 6 */

if (typeof require === 'undefined') {

    alert('This app must be run with Electron. From the project folder run: npm install && npm start');

    throw new Error('Node require() is not available in the browser. Use npm start.');

}

const fs = require('fs');

const path = require('path');

const request = require('request');

const PDFKit = require('pdfkit');

const { ipcRenderer } = require('electron');

const urlInput = document.getElementById('url-input');
const pageFromInput = document.getElementById('page-from');
const pageToInput = document.getElementById('page-to');
const downloadButton = document.getElementById('download-button');

const baseDir = __dirname + '/';



downloadButton.onclick = downloadButtonClicked;



let downloader;

let filename = '';

let length = 0;

let pageUrls = [];
let pageRangeStart = 1;

let imagesTempFolder = baseDir + 'temp/';



function showError(message) {

    console.error(message);

    alert(message);

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
        throw new Error('Sayfa numaraları geçerli pozitif sayılar olmalıdır.');
    }
    if (start > end) {
        throw new Error('Başlangıç sayfası bitiş sayfasından büyük olamaz.');
    }
    if (start > totalPages || end > totalPages) {
        throw new Error(`Sayfa aralığı 1–${totalPages} arasında olmalıdır.`);
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

        throw new Error('Please enter a FlipHTML5 book URL.');

    }

    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    const match = withScheme.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/?/i);

    if (!match) {

        throw new Error('URL must look like https://online.fliphtml5.com/user/book/');

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

            throw new Error('Decrypted FlipHTML5 page list is invalid.');

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

            throw new Error('Could not build legacy image URLs from this book URL.');

        }

        const legacyBase = `http://online.${hostMatch[1]}/${hostMatch[2]}files/large/`;

        const urls = [];

        for (let i = 1; i <= pageCount; i++) {

            urls.push(`${legacyBase}${i}.jpg`);

        }

        return urls;

    }



    throw new Error('Could not find page images in this FlipHTML5 book. The site format may have changed.');

}



function imageBufferForPdf(filePath) {

    const ext = path.extname(filePath).toLowerCase();

    const raw = fs.readFileSync(filePath);



    if (ext !== '.webp') {

        return Promise.resolve(raw);

    }



    return new Promise((resolve, reject) => {

        const blob = new Blob([raw], { type: 'image/webp' });

        const url = URL.createObjectURL(blob);

        const img = new Image();

        img.onload = () => {

            const canvas = document.createElement('canvas');

            canvas.width = img.naturalWidth;

            canvas.height = img.naturalHeight;

            canvas.getContext('2d').drawImage(img, 0, 0);

            URL.revokeObjectURL(url);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

            resolve(Buffer.from(dataUrl.split(',')[1], 'base64'));

        };

        img.onerror = () => {

            URL.revokeObjectURL(url);

            reject(new Error(`Failed to decode image: ${path.basename(filePath)}`));

        };

        img.src = url;

    });

}



function getImageSizeFromBuffer(buffer) {

    return new Promise((resolve, reject) => {

        const blob = new Blob([buffer], { type: 'image/jpeg' });

        const url = URL.createObjectURL(blob);

        const img = new Image();

        img.onload = () => {

            URL.revokeObjectURL(url);

            resolve({ width: img.naturalWidth, height: img.naturalHeight });

        };

        img.onerror = () => {

            URL.revokeObjectURL(url);

            reject(new Error('Failed to read image dimensions.'));

        };

        img.src = url;

    });

}



async function downloadButtonClicked() {

    downloadButton.disabled = true;

    try {

        const bookUrl = normalizeBookUrl(urlInput.value);

        const html = await fetchText(bookUrl);

        const configUrl = findConfigUrl(html, bookUrl);

        const configText = await fetchText(configUrl);

        const config = parseHtmlConfig(configText);



        length = getPageCount(config);

        if (!length) {

            throw new Error('Could not determine the number of pages for this book.');

        }



        filename = `${getBookTitle(config, html)}.pdf`;

        pageUrls = await resolvePageUrls(bookUrl, config, html);

        if (!pageUrls.length) {

            throw new Error('No page image URLs were found for this book.');

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

        imagesTempFolder = baseDir + titleBase + '/';

        if (!fs.existsSync(imagesTempFolder)) {
            fs.mkdirSync(imagesTempFolder);
        }

        downloader = downloadAll(pageUrls);

        downloader.next();

    } catch (err) {

        showError(err.message || String(err));

        downloadButton.disabled = false;

    }

}



let done = false;



function* downloadAll(urls) {

    done = false;

    for (let i = 0; i < urls.length; i++) {

        const url = urls[i];

        const ext = path.extname(url.split('?')[0]) || '.jpg';

        const outName = `${i + 1}${ext}`;

        console.log(`Downloading page ${pageRangeStart + i} (${i + 1}/${urls.length})`);

        yield download(url, outName);

    }

}



function download(url, outName) {

    request(url).pipe(fs.createWriteStream(imagesTempFolder + outName)).on('close', () => {

        if (!done) {

            const resp = downloader.next();

            done = resp.done;

            if (done) {

                console.log('Done downloading.');

                convertToPDF().catch((err) => {

                    showError(err.message || String(err));

                    downloadButton.disabled = false;

                });

            }

        }

    }).on('error', (err) => {

        showError(`Download failed: ${err.message}`);

        downloadButton.disabled = false;

    });

}



async function convertToPDF() {

    console.log('Creating the PDF');

    let doc;



    for (let i = 0; i < length; i++) {

        console.log(`Adding image ${i + 1}/${length}`);

        const files = fs.readdirSync(imagesTempFolder).filter((f) => f.startsWith(`${i + 1}.`));

        if (!files.length) {

            throw new Error(`Missing downloaded file for page ${i + 1}.`);

        }

        const imgPath = imagesTempFolder + files[0];

        const imgBuffer = await imageBufferForPdf(imgPath);

        const imgSize = await getImageSizeFromBuffer(imgBuffer);



        if (!i) {

            doc = new PDFKit({

                size: [imgSize.width, imgSize.height],

            });

            doc.pipe(fs.createWriteStream(baseDir + filename));

        } else {

            doc.addPage({

                size: [imgSize.width, imgSize.height],

            });

        }

        doc.image(imgBuffer, 0, 0, {

            fit: [imgSize.width, imgSize.height],

            align: 'center',

            valign: 'center',

        });

        fs.unlinkSync(imgPath);

    }



    console.log('Done creating PDF');

    doc.end();

    try {

        fs.rmdirSync(imagesTempFolder);

    } catch (err) {

        console.warn('Could not remove temp folder:', err.message);

    }

    downloadButton.disabled = false;

    alert(`PDF saved as ${filename}`);

}

