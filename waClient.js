const { Client, LocalAuth } = require('whatsapp-web.js');

let qrCodeData = null;
let clientStatus = 'initializing'; // initializing | qr | ready | disconnected

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
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    clientStatus = 'qr';
    console.log('[WA] QR Code diterima. Buka /qr di browser untuk scan.');
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
});

client.on('disconnected', (reason) => {
    clientStatus = 'disconnected';
    console.warn('[WA] Client terputus:', reason);
    // Coba reconnect setelah 10 detik
    setTimeout(() => {
        console.log('[WA] Mencoba reconnect...');
        clientStatus = 'initializing';
        client.initialize();
    }, 10000);
});

function getQR() {
    return qrCodeData;
}

function getStatus() {
    return clientStatus;
}

module.exports = { client, getQR, getStatus };
