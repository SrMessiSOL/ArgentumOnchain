/** Preserve rendered position across overlapping remote steps, with a two-tile bound. */
export function continuousMovementOffset(tileSize: number, dx: number, dy: number, previous: {x:number;y:number}, remote: boolean) {
    const base = { x: -tileSize * dx, y: -tileSize * dy };
    if (!remote || Math.abs(dx) + Math.abs(dy) !== 1) return base;
    const x = base.x + previous.x;
    const y = base.y + previous.y;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) + Math.abs(y) > tileSize * 2) return base;
    return { x, y };
}
