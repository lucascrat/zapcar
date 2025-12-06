
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function main() {
    console.log("Restoring session 'default'...");

    // Wait first to ensure previous delete is fully processed
    console.log("Waiting 10s for cleanup...");
    await new Promise(r => setTimeout(r, 10000));

    try {
        const res = await fetch(`${WAHA_API_URL}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY
            },
            body: JSON.stringify({ name: SESSION_NAME, config: { webhooks: [] } })
        });

        console.log("Create Status:", res.status);

        console.log("Waiting 10s for startup...");
        await new Promise(r => setTimeout(r, 10000));

        const listAfter = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        console.log("Final Sessions:", await listAfter.json());

    } catch (e) {
        console.error(e);
    }
}
main();
