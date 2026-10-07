export {};
const { initializeObjectsFromApi } = require("./gameDataSync");
const vars = require("./vars");

class LoadObjs {
    constructor() {}

    async initialize() {
        await this.load();

        console.log("Objects loaded.");
    }

    load() {
        return new Promise(async (resolve: any, reject: any) => {
            vars.datObj = {};

            try {
                const result = await initializeObjectsFromApi();
                console.log(
                    `[GAME DATA] Objects loaded from DB: ${result.loadedObjects}. Applied version: ${result.currentVersion}.`,
                );
                if (result.loadedObjects <= 0) {
                    reject(new Error("Could not load objects from the API."));
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            resolve(true);
        });
    }
}

module.exports = LoadObjs;
