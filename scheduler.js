const axios = require('axios');
const moment = require('moment-timezone');
require('moment/locale/id');
moment.locale('id');

const { fetchSheetData } = require('./googleSheets');

const WA_API_URL = process.env.WA_API_URL;
const WA_API_TOKEN = process.env.WA_API_TOKEN;

const formatWANumber = (number) => {
    if (!number) return null;
    let formatted = number.toString().trim();
    formatted = formatted.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    }
    return formatted;
};

async function sendWhatsAppMessage(target, message) {
    if (!WA_API_URL) {
        console.error('[FSN] URL API belum diatur.');
        return;
    }
    try {
        await axios.post(WA_API_URL, {
            phone: target,
            message: message
        }, {
            headers: {
                'X-API-Key': WA_API_TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[FSN] Berhasil mengirim ke ${target}`);
    } catch (error) {
        console.error(`[FSN] Gagal mengirim ke ${target}:`, error.response ? error.response.data : error.message);
    }
}

async function runScheduleCheck() {
    try {
        const scheduleData = await fetchSheetData();

        const currentTime = moment().tz('Asia/Jakarta');
        const currentTimeStr = currentTime.format('HH:mm');
        const currentDayStr = currentTime.format('dddd');

        console.log(`[Scheduler] Memeriksa jadwal: ${currentTimeStr} (${currentDayStr})`);

        const tasksToRun = scheduleData.filter(row => {
            const isActive = row.statusAktif && row.statusAktif.toString().trim().toUpperCase() === 'TRUE';
            if (!isActive || !row.nomorWa) return false;

            let waktuHarian = row.waktuHarian ? row.waktuHarian.trim() : '';
            if (waktuHarian.length === 4 && waktuHarian.indexOf(':') === 1) {
                waktuHarian = '0' + waktuHarian;
            }
            waktuHarian = waktuHarian.replace('.', ':');

            const isTimeMatch = waktuHarian === currentTimeStr;
            let hariSheet = row.hari ? row.hari.trim().toLowerCase() : '';
            const isDayMatch = hariSheet === currentDayStr.toLowerCase();

            return isTimeMatch && isDayMatch;
        });

        if (tasksToRun.length > 0) {
            console.log(`[Scheduler] ${tasksToRun.length} jadwal cocok. Mengirim pesan...`);
            for (const task of tasksToRun) {
                const targetNumber = formatWANumber(task.nomorWa);
                if (!targetNumber) continue;

                const textMsg = `👨‍🏫 *Reminder Jadwal Mengajar*\n\nHalo, Kak ${task.namaTutor}! 👋\nBerikut pengingat jadwal mengajar hari ini.\n\n📖 *Detail Mengajar:*\n👩🏻‍🎓 Nama Murid: ${task.namaMurid}\n📅 Hari: ${task.hari}\n⏰ Jam: ${task.jam}\n\nMohon untuk mempersiapkan materi sebelum kelas dimulai dan hadir 5–10 menit lebih awal.\n\nApabila terdapat kendala atau berhalangan mengajar, mohon segera menghubungi admin.\n\nTerima kasih atas kerja samanya. 😊\n\nAdmin OMAETEE COURSE 🙌🏻`;

                await sendWhatsAppMessage(targetNumber, textMsg);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } else {
            console.log(`[Scheduler] Tidak ada jadwal cocok untuk ${currentDayStr} ${currentTimeStr}.`);
        }

        return { sent: tasksToRun.length, total: scheduleData.length };
    } catch (error) {
        console.error('[Scheduler] Error:', error.message);
        throw error;
    }
}

module.exports = { runScheduleCheck };
