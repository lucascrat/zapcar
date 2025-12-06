
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function probe(url) {
    console.log(`Probe: ${url}`);
    try {
        const res = await fetch(url, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        console.log(`Status: ${res.status}`);
        if (res.ok) console.log("OK!");
        else console.log(await res.text());
    } catch (e) { console.log(e.message); }
}

async function main() {
    // 1. Session in path
    await probe(`${WAHA_API_URL}/api/${SESSION_NAME}/chats`);
    await probe(`${WAHA_API_URL}/api/${SESSION_NAME}/contacts`);

    // 2. Magic chatId
    await probe(`${WAHA_API_URL}/api/messages?limit=10&session=${SESSION_NAME}&chatId=all`);
    await probe(`${WAHA_API_URL}/api/messages?limit=10&session=${SESSION_NAME}&chatId=status@broadcast`); // Public group often exists or fails gracefully
}

main();
