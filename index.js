require('dotenv').config();
const express = require('express');
const cron = require('node-cron');

const https = require('https');
const http = require('http');

const { client, getQR, getStatus, initializeClient } = require('./waClient');
const { runScheduleCheck } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Health Check ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WA Bot OMAETEE COURSE',
        wa_status: getStatus(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), wa_status: getStatus() });
});

// ── QR Code Endpoints ──────────────────────────────────────────────────
app.get('/qr', async (req, res) => {
    res.send(`
        <html><head><title>Scan QR - WA Bot</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        </head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc">
            <h2 id="title">📱 Scan QR Code dengan WhatsApp</h2>
            <div id="qr" style="display:inline-block;border:4px solid #e2e8f0;border-radius:12px;margin:20px 0;padding:10px;background:#fff"></div>
            <p id="status" style="color:#64748b">Memuat...</p>
            <script>
                async function fetchQR() {
                    const res = await fetch('/qr-text');
                    const data = await res.json();
                    const container = document.getElementById('qr');
                    if (data.status === 'ready') {
                        document.body.innerHTML = '<h2>✅ WhatsApp Sudah Terkoneksi!</h2>';
                    } else if (data.qr) {
                        container.innerHTML = '';
                        new QRCode(container, data.qr);
                        document.getElementById('status').innerText = 'Scan QR ini menggunakan WhatsApp';
                    } else {
                        document.getElementById('status').innerText = 'Menunggu QR...';
                    }
                }
                fetchQR();
                setInterval(fetchQR, 5000);
            </script>
        </body></html>
    `);
});

app.get('/qr-text', (req, res) => {
    res.json({
        status: getStatus(),
        qr: getQR()
    });
});

// ── Status Endpoint ────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({
        wa_status: getStatus(),
        uptime_seconds: Math.floor(process.uptime()),
        message: getStatus() === 'ready'
            ? 'Bot aktif dan siap mengirim pesan ✅'
            : 'Bot belum siap. Buka /qr untuk scan QR code.'
    });
});

// ── Manual Trigger — untuk testing ────────────────────────────────────
app.get('/run', async (req, res) => {
    if (getStatus() !== 'ready') {
        return res.status(503).json({
            success: false,
            error: 'WA Client belum siap. Buka /qr untuk scan QR code terlebih dahulu.'
        });
    }
    try {
        const result = await runScheduleCheck(client);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Keep-Alive: Ping diri sendiri setiap 14 menit (supaya Render tidak sleep) ──
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL;
    if (!url) {
        console.log('[Keep-Alive] RENDER_EXTERNAL_URL tidak diset, skip ping.');
        return;
    }
    const target = `${url}/health`;
    const lib = target.startsWith('https') ? https : http;
    lib.get(target, (res) => {
        console.log(`[Keep-Alive] Ping ke ${target} → status ${res.statusCode}`);
    }).on('error', (err) => {
        console.error('[Keep-Alive] Ping gagal:', err.message);
    });
}

// Mulai self-ping setiap 14 menit setelah server berjalan
setTimeout(() => {
    keepAlive(); // ping pertama
    setInterval(keepAlive, 14 * 60 * 1000); // lanjut setiap 14 menit
}, 30000); // tunggu 30 detik setelah server start

// ── Start HTTP Server ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Server] Berjalan di port ${PORT}`);
    console.log(`[Server] Buka /qr untuk scan QR WhatsApp`);
});

// ── Global Error Handlers ── Cegah proses mati saat Chromium crash ────────────────
process.on('uncaughtException', (err) => {
    console.error('[Process] uncaughtException (bot tetap berjalan):', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Process] unhandledRejection (bot tetap berjalan):', reason?.message || reason);
});

// ── Init WA Client ──────────────────────────────────────────────────
console.log('[WA] Memulai WhatsApp client...');
initializeClient();

// ── Cron Internal: Setiap menit ────────────────────────────────────────
cron.schedule('* * * * *', async () => {
    if (getStatus() !== 'ready') {
        console.log('[Cron] WA belum siap, skip pengecekan jadwal.');
        return;
    }
    try {
        await runScheduleCheck(client);
    } catch (error) {
        console.error('[Cron] Error:', error.message);
    }
}, {
    timezone: 'Asia/Jakarta'
});
