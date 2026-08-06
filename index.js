require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const qrcode = require('qrcode');
const https = require('https');
const http = require('http');

const { client, getQR, getStatus } = require('./waClient');
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

// ── QR Code Endpoint — Scan ini untuk login WA ─────────────────────────
app.get('/qr', async (req, res) => {
    const status = getStatus();

    if (status === 'ready') {
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4">
                <h2 style="color:#16a34a">✅ WhatsApp Sudah Terkoneksi!</h2>
                <p>Bot aktif dan siap mengirim pesan.</p>
                <a href="/status" style="color:#2563eb">Lihat Status</a>
            </body></html>
        `);
    }

    const qr = getQR();
    if (!qr) {
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#fefce8">
                <h2 style="color:#ca8a04">⏳ Menunggu QR Code...</h2>
                <p>Status: <strong>${status}</strong></p>
                <p>Coba refresh halaman ini dalam 5–10 detik.</p>
                <meta http-equiv="refresh" content="5">
            </body></html>
        `);
    }

    try {
        const qrImageUrl = await qrcode.toDataURL(qr);
        res.send(`
            <html><head><title>Scan QR - WA Bot</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc">
                <h2>📱 Scan QR Code dengan WhatsApp</h2>
                <p style="color:#64748b">Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat → Scan QR ini</p>
                <img src="${qrImageUrl}" style="border:4px solid #e2e8f0;border-radius:12px;margin:20px 0" />
                <p style="color:#94a3b8;font-size:14px">QR Code otomatis refresh setiap 30 detik. <a href="/qr">Refresh manual</a></p>
                <meta http-equiv="refresh" content="30">
            </body></html>
        `);
    } catch (err) {
        res.status(500).json({ error: 'Gagal generate QR image', detail: err.message });
    }
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

// ── Init WA Client ─────────────────────────────────────────────────────
console.log('[WA] Memulai WhatsApp client...');
client.initialize();

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
