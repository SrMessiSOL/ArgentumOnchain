export {};

const vars = require("./vars");
const { loadDefaultCraftingRecipesData } = require("./craftingRecipeData");
const { initializeCraftingRecipesFromApi } = require("./gameDataSync");

class LoadCraftingRecipes {
    async initialize() {
        await this.load();
        console.log("Crafting recipes loaded.");
    }

    async load() {
        vars.craftingRecipes = loadDefaultCraftingRecipesData();

        try {
            const result = await initializeCraftingRecipesFromApi();
            console.log(
                `[GAME DATA] Crafting loaded from DB: ${result.loadedRecipes}. Applied version: ${result.currentVersion}.`,
            );
        } catch {
            console.warn("[GAME DATA] Could not load crafting from API at startup. Using local data.");
        }
    }
}

module.exports = LoadCraftingRecipes;
