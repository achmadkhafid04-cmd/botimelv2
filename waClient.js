const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

let qrCodeData = null;
let clientStatus = 'initializing';
let isReconnecting = false;
let sock = null; // Ini akan menjadi socket utama

const SESSION_PATH = '/tmp/.baileys_auth';

function cleanLockFiles() {
    // Pada Baileys biasanya tidak ada singleton lock browser, 
    // Tapi kita sediakan opsi hapus folder auth kalau butuh restart total.
    // Jika tidak ingin menghapus auth state (log out), biarkan saja.
}

async function initializeClient() {
    isReconnecting = false;
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }), // Matikan log bawaan Baileys yang terlalu ramai
        browser: ['OMAETEE Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            clientStatus = 'qr';
            console.log('[WA] QR Code diterima. Tersedia di /qr');
        }

        if (connection === 'connecting') {
            if (clientStatus !== 'qr') {
                console.log('[WA] Loading: Menghubungkan ke server WA...');
                clientStatus = 'initializing';
            }
        }

        if (connection === 'close') {
            qrCodeData = null;
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.warn('[WA] Client terputus. Alasan:', lastDisconnect.error?.message);
            clientStatus = 'disconnected';
            
            if (shouldReconnect) {
                scheduleReconnect();
            } else {
                console.log('[WA] Anda telah Log Out. Menghapus data sesi...');
                if (fs.existsSync(SESSION_PATH)) {
                    fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                }
                scheduleReconnect(); // Mulai ulang untuk generate QR baru
            }
        }

        if (connection === 'open') {
            qrCodeData = null;
            clientStatus = 'ready';
            isReconnecting = false;
            console.log('[WA] Client siap! Bot WhatsApp sudah terkoneksi. ✅ (Baileys Engine)');
        }
    });
}

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('[WA] Mencoba reconnect dalam 5 detik...');

    setTimeout(async () => {
        try {
            await initializeClient();
        } catch (err) {
            console.error('[WA] Gagal reconnect:', err.message);
            isReconnecting = false;
            scheduleReconnect();
        }
    }, 5000);
}

async function restartClient() {
    clientStatus = 'initializing';
    qrCodeData = null;
    try {
        if (sock) sock.logout();
    } catch (e) {}
    
    // Hapus sesi auth agar dapat QR baru bersih
    if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await initializeClient();
}

// Wrapper untuk mencocokkan format `client.sendMessage(target, text)` seperti di whatsapp-web.js
const clientWrapper = {
    sendMessage: async (jid, text) => {
        if (!sock) throw new Error("Socket belum siap");
        // Baileys memakai format pesan text di dalam object
        await sock.sendMessage(jid, { text: text });
    }
};

function getQR() {
    return qrCodeData;
}

function getStatus() {
    return clientStatus;
}

module.exports = { client: clientWrapper, getQR, getStatus, initializeClient, restartClient };
