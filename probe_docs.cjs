
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";

async function probe(url) {
    try {
        console.log(`Probe: ${url}`);
        const res = await fetch(url);
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const text = await res.text();
            console.log("Start: " + text.substring(0, 500));
        }
    } catch (e) { console.log(e.message); }
}

async function main() {
    await probe(`${WAHA_API_URL}/api-json`);
    await probe(`${WAHA_API_URL}/api/docs/json`);
    await probe(`${WAHA_API_URL}/swagger.json`);
    await probe(`${WAHA_API_URL}/api/swagger.json`);
}

main();
