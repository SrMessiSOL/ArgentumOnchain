-- Preserve a legacy selected title only when one character actually earned it.
-- Ambiguous account histories require the player to choose; NFTs confer no rights.
WITH candidates AS (
 SELECT p.id AS character_id,
 CASE WHEN c.season='first-hunt-devnet-v1' THEN 'first-hunt' ELSE 'explorer' END AS kind,
 COUNT(*) OVER(PARTITION BY p.account_id) AS eligible_count
 FROM characters p JOIN cosmetic_equipment e ON e.account_id=p.account_id
 JOIN cosmetic_claims c ON c.asset_address=e.asset_address
 WHERE p.deleted_at IS NULL AND p.level>=2 AND c.state='confirmed'
 AND (c.season='explorer-devnet-v1' OR (c.season='first-hunt-devnet-v1' AND p.npc_matados>=4))
)
INSERT INTO character_titles(character_id,kind)
SELECT character_id,kind FROM candidates WHERE eligible_count=1 ON CONFLICT DO NOTHING;
