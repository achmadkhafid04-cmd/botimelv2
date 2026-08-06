const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

let qrCodeData = null;
let clientStatus = 'initializing';
let isReconnecting = false; // Flag agar tidak reconnect ganda

const SESSION_PATH = '/tmp/.wwebjs_auth';

// Bersihkan lock file yang tersisa dari proses lama
function cleanLockFiles() {
    try {
        const lockFile = path.join(SESSION_PATH, 'session', 'SingletonLock');
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log('[WA] Lock file lama dibersihkan.');
        }
        const cookieLock = path.join(SESSION_PATH, 'session', 'SingletonCookie');
        if (fs.existsSync(cookieLock)) {
            fs.unlinkSync(cookieLock);
        }
    } catch (e) {
        // Abaikan error saat cleanup
    }
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: SESSION_PATH
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
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
            '--mute-audio',
            '--js-flags=--max-old-space-size=256'
        ]
    }
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    clientStatus = 'qr';
    isReconnecting = false;
    console.log('[WA] QR Code diterima. Buka /qr di browser untuk scan.');
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WA] Loading: ${percent}% - ${message}`);
});

client.on('ready', () => {
    qrCodeData = null;
    clientStatus = 'ready';
    isReconnecting = false;
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
    if (isReconnecting) {
        console.log('[WA] Sudah dalam proses reconnect, skip.');
        return;
    }
    isReconnecting = true;
    console.log('[WA] Mencoba reconnect dalam 20 detik...');

    setTimeout(async () => {
        try {
            // Destroy browser lama dulu
            try {
                await client.destroy();
                console.log('[WA] Browser lama berhasil di-destroy.');
            } catch (destroyErr) {
                console.log('[WA] Destroy error (diabaikan):', destroyErr.message);
            }

            // Bersihkan lock files
            cleanLockFiles();

            // Tunggu sebentar sebelum init ulang
            await new Promise(resolve => setTimeout(resolve, 3000));

            clientStatus = 'initializing';
            await client.initialize();
        } catch (err) {
            console.error('[WA] Gagal reconnect:', err.message);
            isReconnecting = false;
            scheduleReconnect();
        }
    }, 20000);
}

async function initializeClient() {
    cleanLockFiles(); // Bersihkan sisa lock dari proses lama
    try {
        await client.initialize();
    } catch (err) {
        console.error('[WA] Error saat initialize:', err.message);
        isReconnecting = false;
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
