
const fs = require('fs');

const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function main() {
    console.log("Checking session status...");

    for (let i = 0; i < 10; i++) {
        try {
            const res = await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/status`, {
                headers: { 'X-Api-Key': WAHA_API_KEY }
            });
            const data = await res.json();
            console.log(`[Attempt ${i + 1}] Status:`, data);

            if (data.status === 'SCAN_QR_CODE') {
                console.log("Status is SCAN_QR_CODE! Fetching image...");
                const qrRes = await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/screenshot?session=${SESSION_NAME}`, {
                    headers: { 'X-Api-Key': WAHA_API_KEY }
                });
                if (qrRes.ok) {
                    const buffer = await qrRes.arrayBuffer();
                    fs.writeFileSync('waha_qrcode.png', Buffer.from(buffer));
                    console.log("✅ QR Code DOWNLOADED to waha_qrcode.png");
                    return;
                }
            } else if (data.status === 'WORKING') {
                console.log("Session is already WORKING! No QR code needed.");
                return;
            }

        } catch (e) { console.log(e.message); }
        await new Promise(r => setTimeout(r, 2000));
    }
}

main();
