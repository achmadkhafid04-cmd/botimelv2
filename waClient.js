const { Client, LocalAuth } = require('whatsapp-web.js');

let qrCodeData = null;
let clientStatus = 'initializing';

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/tmp/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',       // Jangan pakai /dev/shm (penting untuk Render)
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
            '--js-flags=--max-old-space-size=256'  // Batasi memory JS heap ke 256MB
        ]
        // HAPUS --single-process karena menyebabkan ProtocolError
    }
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    clientStatus = 'qr';
    console.log('[WA] QR Code diterima. Buka /qr di browser untuk scan.');
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WA] Loading: ${percent}% - ${message}`);
});

client.on('ready', () => {
    qrCodeData = null;
    clientStatus = 'ready';
    console.log('[WA] Client siap! Bot WhatsApp sudah terkoneksi. ✅');
});

client.on('authenticated', () => {
    console.log('[WA] Autentikasi berhasil.');
});

client.on('auth_failure', (msg) => {
    clientStatus = 'disconnected';
    console.error('[WA] Autentikasi gagal:', msg);
    scheduleReconnect();
});

client.on('disconnected', (reason) => {
    clientStatus = 'disconnected';
    console.warn('[WA] Client terputus:', reason);
    scheduleReconnect();
});

function scheduleReconnect() {
    console.log('[WA] Mencoba reconnect dalam 15 detik...');
    setTimeout(async () => {
        try {
            clientStatus = 'initializing';
            await client.initialize();
        } catch (err) {
            console.error('[WA] Gagal reconnect:', err.message);
            scheduleReconnect(); // Coba lagi
        }
    }, 15000);
}

async function initializeClient() {
    try {
        await client.initialize();
    } catch (err) {
        console.error('[WA] Error saat initialize:', err.message);
        scheduleReconnect();
    }
}

function getQR() {
    return qrCodeData;
}

function getStatus() {
    return clientStatus;
}

module.exports = { client, getQR, getStatus, initializeClient };
