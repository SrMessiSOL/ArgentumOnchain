/** Fixed server-authored titles; never accept arbitrary text from clients or RPC metadata. */
export function cosmeticInspectionMessage(name:string,kind:unknown):string|null {
    const title=kind==='first-hunt'?'Emblema de la primera cacería':kind==='explorer'?'Insignia de explorador':null;
    return title ? `${name} — Título: ${title}` : null;
}
