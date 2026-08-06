require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

const { client, getQR, getStatus, initializeClient, restartClient } = require('./waClient');
const { runScheduleCheck } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Global Error Handlers ── Cegah proses mati saat Chromium crash ────────────────
process.on('uncaughtException', (err) => {
    console.error('[Process] uncaughtException (bot tetap berjalan):', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Process] unhandledRejection (bot tetap berjalan):', reason?.message || reason);
});

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
            <div id="qr" style="display:inline-block;border:4px solid #e2e8f0;border-radius:12px;margin:20px 0;padding:10px;background:#fff;min-height:256px;min-width:256px;"></div>
            <p id="status" style="color:#64748b">Memuat...</p>
            <div style="margin-top:20px;">
                <button onclick="requestNewQR()" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;box-shadow:0 4px 6px rgba(37,99,235,0.2);">
                    🔄 Minta QR Baru (Waktu Habis)
                </button>
            </div>
            <script>
                async function fetchQR() {
                    const res = await fetch('/qr-text');
                    const data = await res.json();
                    const container = document.getElementById('qr');
                    if (data.status === 'ready') {
                        document.body.innerHTML = '<h2 style="color:#16a34a;margin-top:50px;">✅ WhatsApp Sudah Terkoneksi!</h2><p>Tutup halaman ini.</p>';
                    } else if (data.qr) {
                        container.innerHTML = '';
                        new QRCode(container, data.qr);
                        document.getElementById('status').innerText = 'Scan QR ini secepatnya menggunakan WhatsApp HP Anda';
                    } else {
                        container.innerHTML = '<h3 style="color:#94a3b8;margin-top:100px;">Menyiapkan...</h3>';
                        document.getElementById('status').innerText = 'Status: ' + data.status;
                    }
                }
                async function requestNewQR() {
                    document.getElementById('status').innerText = 'Meminta QR baru, tunggu sebentar...';
                    document.getElementById('qr').innerHTML = '';
                    await fetch('/restart-wa');
                }
                fetchQR();
                setInterval(fetchQR, 3000); // Polling update tiap 3 detik agar lebih responsif
            </script>
        </body></html>
    `);
});

app.get('/restart-wa', (req, res) => {
    restartClient(); // Panggil fungsi restart untuk reset timer QR 60 detik
    res.json({ success: true, message: 'Restarting...' });
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

// ── Keep-Alive: Ping diri sendiri setiap 14 menit ─────────────────────
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

setTimeout(() => {
    keepAlive();
    setInterval(keepAlive, 14 * 60 * 1000);
}, 30000);

// ── Start HTTP Server ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Server] Berjalan di port ${PORT}`);
    console.log(`[Server] Buka /qr untuk scan QR WhatsApp`);
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
