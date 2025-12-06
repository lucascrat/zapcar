
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";
const TEST_PHONE = "558899814422@c.us"; // Safe format guess, or use one from logs if available

async function probePost(url) {
    console.log(`POST ${url}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY
            },
            body: JSON.stringify({
                chatId: TEST_PHONE,
                text: "Probe Test",
                session: SESSION_NAME
            })
        });
        console.log(`Status: ${res.status}`);
        if (res.status !== 404) console.log("Body:", await res.text());
    } catch (e) { console.log(e.message); }
}

async function main() {
    await probePost(`${WAHA_API_URL}/api/sendText`);
    await probePost(`${WAHA_API_URL}/api/${SESSION_NAME}/sendText`);
    await probePost(`${WAHA_API_URL}/api/${SESSION_NAME}/sendMessage`);
    await probePost(`${WAHA_API_URL}/api/${SESSION_NAME}/messages/text`);
}

main();
