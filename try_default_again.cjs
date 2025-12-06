
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";
const SESSION_NAME = "default";

async function main() {
    console.log(`Creating session '${SESSION_NAME}'...`);
    try {
        const res = await fetch(`${WAHA_API_URL}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY
            },
            body: JSON.stringify({ name: SESSION_NAME, config: { webhooks: [] } })
        });

        console.log("Status:", res.status);

        console.log("Waiting 5s...");
        await new Promise(r => setTimeout(r, 5000));

        const list = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, { headers: { 'X-Api-Key': WAHA_API_KEY } });
        console.log("Sessions:", await list.json());

    } catch (e) {
        console.error(e);
    }
}
main();
