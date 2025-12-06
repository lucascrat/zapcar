
const fs = require('fs');
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function main() {
    console.log("Trying to create session 'default' (Simple payload)...");

    // First, list to see if it miraculously appeared
    try {
        const list = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        const sessions = await list.json();
        console.log("Sessions before:", sessions);
        const exists = sessions.find(s => s.name === SESSION_NAME);
        if (exists) {
            console.log("Session exists, deleting...");
            await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}`, { method: 'DELETE', headers: { 'X-Api-Key': WAHA_API_KEY } });
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (e) { }

    try {
        const res = await fetch(`${WAHA_API_URL}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY
            },
            body: JSON.stringify({ name: SESSION_NAME }) // Simple payload
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Body:", text);

        console.log("Waiting 5s...");
        await new Promise(r => setTimeout(r, 5000));

        const listAfter = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        console.log("Sessions after:", await listAfter.json());

    } catch (e) {
        console.error(e);
    }
}
main();
