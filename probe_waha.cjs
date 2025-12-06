
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function probe(url, name) {
    try {
        console.log(`\nTesting ${name}: ${url}`);
        const res = await fetch(url, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            const isArray = Array.isArray(data);
            console.log(`Result: ${isArray ? `Array[${data.length}]` : 'Object'}`);
            if (isArray && data.length > 0) console.log("Sample:", JSON.stringify(data[0]).substring(0, 100));
            else console.log("Body:", JSON.stringify(data).substring(0, 200));
        } else {
            console.log("Error:", await res.text());
        }
    } catch (e) {
        console.log("Exception:", e.message);
    }
}

async function main() {
    // 1. Chats variations
    await probe(`${WAHA_API_URL}/api/chats?session=${SESSION_NAME}`, "GET /api/chats");
    await probe(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/chats`, "GET /api/sessions/{s}/chats");

    // 2. Contacts (fallback)
    await probe(`${WAHA_API_URL}/api/contacts?session=${SESSION_NAME}`, "GET /api/contacts");

    // 3. Messages variations
    await probe(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/messages?limit=10`, "GET /api/sessions/{s}/messages");

    // 4. History (if available)
    await probe(`${WAHA_API_URL}/api/history?session=${SESSION_NAME}&limit=10`, "GET /api/history");
}

main();
