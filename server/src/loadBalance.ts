export {};

const { initializeBalanceFromApi } = require("./gameDataSync");

class LoadBalance {
    async initialize() {
        await this.load();
        console.log("Balance loaded.");
    }

    async load() {
        try {
            const result = await initializeBalanceFromApi();
            console.log(
                `[GAME DATA] Balance loaded from DB: ${result.loadedProfiles}. Applied version: ${result.currentVersion}. Refreshed characters: ${result.refreshedCharacters}.`,
            );
        } catch {
            console.warn("[GAME DATA] Could not load balance from API at startup. Using local data.");
        }
    }
}

module.exports = LoadBalance;
