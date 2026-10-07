import pool from "../db";
import { listNpcSoldItemIds } from "../repositories/gameNpcs";
import { cancelForbiddenMarketListings } from "../repositories/market";

async function main() {
    const itemIds = await listNpcSoldItemIds();

    if (!itemIds.length) {
        throw new Error("No NPC-sold items found in game_npcs");
    }

    const result = await cancelForbiddenMarketListings(itemIds);

    console.log(
        [
            `Listings cancelled: ${result.cancelledListings}`,
            `Fees refunded: ${result.refundedPublicationFees}`,
            `NPC items analyzed: ${itemIds.length}`,
        ].join(" | "),
    );
}

main()
    .catch(async (error) => {
        console.error(error);
        await pool.end().catch(() => undefined);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });
