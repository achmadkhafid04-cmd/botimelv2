const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let qrCodeData = null;
let clientStatus = 'initializing';
let isReconnecting = false;
let isAuthenticated = false;

const SESSION_PATH = '/tmp/.wwebjs_auth';

// Fungsi brutal untuk membunuh semua sisa proses chrome/chromium di background
function forceKillChrome() {
    return new Promise((resolve) => {
        exec('pkill -f chrome', (err) => {
            exec('pkill -f chromium', (err2) => {
                resolve();
            });
        });
    });
}

function cleanLockFiles() {
    try {
        const lockFile = path.join(SESSION_PATH, 'session', 'SingletonLock');
        if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
        
        const cookieLock = path.join(SESSION_PATH, 'session', 'SingletonCookie');
        if (fs.existsSync(cookieLock)) fs.unlinkSync(cookieLock);
    } catch (e) {}
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
    console.log('[WA] QR Code diterima. Tersedia di /qr');
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
    if (isAuthenticated) {
        scheduleReconnect();
    } else {
        setTimeout(scheduleReconnect, 30000);
    }
});

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('[WA] Mencoba reconnect...');

    setTimeout(async () => {
        try {
            try { await client.destroy(); } catch (err) {}
            await forceKillChrome(); // Paksa matikan browser yg nyangkut
            cleanLockFiles();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            clientStatus = 'initializing';
            await client.initialize();
        } catch (err) {
            console.error('[WA] Gagal reconnect:', err.message);
            isReconnecting = false;
            scheduleReconnect();
        }
    }, 5000);
}

async function initializeClient() {
    await forceKillChrome();
    cleanLockFiles();
    try {
        await client.initialize();
    } catch (err) {
        console.error('[WA] Error saat initialize:', err.message);
        isReconnecting = false;
        scheduleReconnect();
    }
}

async function restartClient() {
    clientStatus = 'initializing';
    qrCodeData = null;
    try {
        await client.destroy();
    } catch (err) {}
    
    await forceKillChrome(); // Paksa matikan browser yg nyangkut
    cleanLockFiles();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
        await client.initialize();
    } catch (err) {
        console.error('[WA] Error manual restart:', err.message);
        scheduleReconnect();
    }
}

function getQR() {
    return qrCodeData;
}

function getStatus() {
    return clientStatus;
}

module.exports = { client, getQR, getStatus, initializeClient, restartClient };
