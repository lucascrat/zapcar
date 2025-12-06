
const fs = require('fs');
const path = require('path');

const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function main() {
    console.log(`🔌 Conectando ao WAHA: ${WAHA_API_URL}`);

    // 1. Try to start directly first (maybe previous delete worked but start failed?)
    // But better to be safe: Check list again.

    try {
        const listRes = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });
        const sessions = await listRes.json();
        console.log("Current sessions:", sessions.map(s => `${s.name} (${s.status})`).join(', '));

        const exists = sessions.find(s => s.name === SESSION_NAME);
        if (exists) {
            console.log("Session exists. Deleting...");
            await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}`, {
                method: 'DELETE',
                headers: { 'X-Api-Key': WAHA_API_KEY }
            });
            await new Promise(r => setTimeout(r, 5000)); // Wait longer
        }
    } catch (e) { console.log(e); }

    console.log("🚀 Starting new session...");
    try {
        const res = await fetch(`${WAHA_API_URL}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY
            },
            body: JSON.stringify({
                name: SESSION_NAME,
                config: { webhooks: [] }
            })
        });

        const text = await res.text();
        console.log("Response Status:", res.status);
        console.log("Response Body:", text);

        if (!res.ok) throw new Error(text);

        console.log("📸 Waiting for QR (8s)...");
        await new Promise(r => setTimeout(r, 8000));

        const qrRes = await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/screenshot?session=${SESSION_NAME}`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });

        if (qrRes.ok) {
            const buffer = await qrRes.arrayBuffer();
            fs.writeFileSync('waha_qrcode.png', Buffer.from(buffer));
            console.log("✅ DONE! QR Code saved to waha_qrcode.png");
        } else {
            console.log("❌ Could not get QR:", await qrRes.text());
        }

    } catch (e) {
        console.error(e);
    }
}

main();
