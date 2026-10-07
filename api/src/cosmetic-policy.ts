export const COSMETIC_SEASON = 'explorer-devnet-v1';
export const HUNT_SEASON = 'first-hunt-devnet-v1';
export const HUNT_SUPPLY = 100;
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export function requireDevnet(genesis: string) {
  if(genesis !== DEVNET_GENESIS) throw new Error('Wrong network: devnet is required');
}
export function eligibleForExplorer(level: number): boolean { return Number.isInteger(level) && level >= 2; }
export function ownsExplorer(asset: {owner: string; issuer: string} | null, wallet: string, expectedIssuer: string): boolean {
  return Boolean(asset && asset.owner === wallet && asset.issuer === expectedIssuer);
}
