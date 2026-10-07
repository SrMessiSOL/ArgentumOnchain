import signs from '@/locales/signs-en.json';

const labels = new Map(Object.entries(signs));
const noticeTowns: Record<number, string> = {1: 'Ullathorpe', 34: 'Nix'};

/** Reused notice artwork must name the actual town, not a city baked into the texture. */
export function getLocalizedSignLabel(graphicId: number, mapNumber: number): string | undefined {
    if (graphicId === 4986 && noticeTowns[mapNumber]) {
        return `NOTICE TO TRAVELERS\nWelcome to ${noticeTowns[mapNumber]}.`;
    }
    return labels.get(String(graphicId));
}
