// Loads the real maps only. Does not open sockets, start NPCs or write game data.
// Run with: node --import tsx scripts/check-render-memory.cjs
const LoadMaps = require('../src/loadMaps.ts');
const mib = value => Math.round(value / 1024 / 1024);
async function main() {
    const loader = new LoadMaps();
    const ids = [...Array.from({ length: 290 }, (_, i) => i + 1), 500, 501, 502, 503, 504, 505, 506]
        .filter(id => loader.mapFilesExist(id));
    console.log(JSON.stringify({ stage: 'baseline', maps: ids.length, rssMiB: mib(process.memoryUsage().rss) }));
    for (let index = 0; index < ids.length; index++) {
        await loader.readMap(ids[index]);
        if ((index + 1) % 25 === 0 || index === ids.length - 1) {
            const memory = process.memoryUsage();
            console.log(JSON.stringify({ stage: 'maps', loaded: index + 1, total: ids.length,
                heapUsedMiB: mib(memory.heapUsed), rssMiB: mib(memory.rss) }));
        }
    }
    const memory = process.memoryUsage();
    const fits = memory.rss < 512 * 1024 * 1024;
    console.log(JSON.stringify({ result: fits ? 'MAPS_ONLY_UNDER_LIMIT' : 'EXCEEDS_RENDER_FREE_MEMORY',
        rssMiB: mib(memory.rss), heapUsedMiB: mib(memory.heapUsed), renderFreeMiB: 512,
        note: 'Local Windows/Node measurement, not a Render deployment or Linux cgroup test. Excludes active NPCs and players.' }));
    process.exit(fits ? 0 : 2);
}
main().catch(error => { console.error(error); process.exit(1); });
