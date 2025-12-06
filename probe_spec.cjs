
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
const WAHA_API_KEY = "01Deus02@";

async function main() {
    const url = `${WAHA_API_URL}/api-json`;
    try {
        const res = await fetch(url, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });

        if (res.ok) {
            const spec = await res.json();
            // Find paths related to 'chat' or 'message'
            const paths = Object.keys(spec.paths);
            console.log("Found Paths:");
            paths.filter(p => p.includes('chat') || p.includes('message') || p.includes('contact')).forEach(p => console.log(p));
        } else {
            console.log("Failed to get spec:", res.status);
        }
    } catch (e) { console.log(e); }
}

main();
