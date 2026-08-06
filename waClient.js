const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

let qrCodeData = null;
let clientStatus = 'initializing';
let isReconnecting = false;
let isAuthenticated = false; // flag if ever authenticated

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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
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
    // Log hanya sekali saat status berubah untuk mengurangi spam log
    console.log('[WA] QR Code diterima. Buka /qr di browser untuk scan.');
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WA] Loading: ${percent}% - ${message}`);
});

client.on('ready', () => {
    qrCodeData = null;
    clientStatus = 'ready';
    isReconnecting = false;
    isAuthenticated = true;
    console.log('[WA] Client siap! Bot WhatsApp sudah terkoneksi. ✅');
});

client.on('authenticated', () => {
    isAuthenticated = true;
    console.log('[WA] Autentikasi berhasil.');
});

client.on('auth_failure', (msg) => {
    clientStatus = 'disconnected';
    isAuthenticated = false;
    console.error('[WA] Autentikasi gagal:', msg);
    scheduleReconnect();
});

client.on('disconnected', (reason) => {
    clientStatus = 'disconnected';
    console.warn('[WA] Client terputus:', reason);
    
    // Jangan spam reconnect kalau terputus saat belum authenticate (misal tutup browser)
    if (isAuthenticated) {
        scheduleReconnect();
    } else {
        console.log('[WA] Client terputus saat fase QR. Menunggu restart dari sistem jika perlu.');
        // Kita panggil scheduleReconnect tapi dengan delay lebih lama jika memang terputus sendiri
        setTimeout(scheduleReconnect, 30000);
    }
});

function scheduleReconnect() {
    if (isReconnecting) {
        return;
    }
    isReconnecting = true;
    console.log('[WA] Mencoba reconnect dalam 20 detik...');

    setTimeout(async () => {
        try {
            try {
                await client.destroy();
                console.log('[WA] Browser lama berhasil di-destroy.');
            } catch (destroyErr) {}

            cleanLockFiles();
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
    cleanLockFiles();
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
