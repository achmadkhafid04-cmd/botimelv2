require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

const { runScheduleCheck } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Health Check ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WA Bot OMAETEE COURSE',
        timestamp: new Date().toISOString(),
        message: 'Bot aktif 🟢'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
});

// ── Manual Trigger — untuk testing ────────────────────────────────────
app.get('/run', async (req, res) => {
    try {
        const result = await runScheduleCheck();
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Keep-Alive: Ping diri sendiri setiap 14 menit ─────────────────────
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL;
    if (!url) return;
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
});

// ── Cron Internal: Setiap menit ────────────────────────────────────────
cron.schedule('* * * * *', async () => {
    try {
        await runScheduleCheck();
    } catch (error) {
        console.error('[Cron] Error:', error.message);
    }
}, {
    timezone: 'Asia/Jakarta'
});

console.log('[Server] Bot OMAETEE COURSE siap. Scheduler aktif setiap menit.');
