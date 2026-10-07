export {};
const vars = require("./vars");
const jsonSpells = require("../jsons/spells.json");

class LoadObjs {
    constructor() {}

    async initialize() {
        await this.load();

        console.log("Spells loaded.");
    }

    load() {
        return new Promise((resolve: any) => {
            vars.datSpell = jsonSpells;

            resolve(true);
        });
    }
}

module.exports = LoadObjs;
