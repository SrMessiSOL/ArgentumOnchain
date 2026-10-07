export {};

const vars = require("./vars");
const { loadDefaultSmeltingRecipesData } = require("./smeltingRecipeData");
const { initializeSmeltingRecipesFromApi } = require("./gameDataSync");

class LoadSmeltingRecipes {
    async initialize() {
        await this.load();
        console.log("Smelting recipes loaded.");
    }

    async load() {
        vars.smeltingRecipes = loadDefaultSmeltingRecipesData();

        try {
            const result = await initializeSmeltingRecipesFromApi();
            console.log(
                `[GAME DATA] Smelting loaded from DB: ${result.loadedRecipes}. Applied version: ${result.currentVersion}.`,
            );
        } catch {
            console.warn("[GAME DATA] Could not load smelting from API at startup. Using local data.");
        }
    }
}

module.exports = LoadSmeltingRecipes;
