import { promises as fs } from 'node:fs';
import path from 'node:path';

type PendingVault = { operationId: string; endpoint: string; payload: string };
type JournalOptions = {
    directory: string;
    allowCharacterSaves?: boolean;
    allowFloorSpawns?: boolean;
    submit: (endpoint: string, payload: string) => Promise<{ ok?: boolean }>;
    delay?: () => Promise<void>;
    warn?: () => void;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VaultJournal {
    constructor(private options: JournalOptions) {}

    private validate(entry: PendingVault): void {
        if (!uuid.test(entry.operationId) ||
            !( (this.options.allowFloorSpawns === true && entry.endpoint === "/internal/floor-spawns") || /^\/internal\/vaults\/(account|clan)\/[0-9a-f-]{36}$/i.test(entry.endpoint) || (this.options.allowCharacterSaves === true && /^\/character_save\/[0-9a-f-]{36}$/i.test(entry.endpoint))) ||
            JSON.parse(entry.payload).operationId !== entry.operationId) {
            throw new Error('Invalid pending vault journal entry');
        }
    }

    async persist(entry: PendingVault): Promise<void> {
        this.validate(entry);
        await fs.mkdir(this.options.directory, { recursive: true });
        const target = path.join(this.options.directory, `${entry.operationId}.json`);
        const temporary = `${target}.tmp`;
        const file = await fs.open(temporary, 'wx');
        try { await file.writeFile(JSON.stringify(entry), 'utf8'); await file.sync(); }
        finally { await file.close(); }
        // Never send the transfer until the journal record is complete.
        await fs.rename(temporary, target);
        await this.resolve(entry, target);
    }

    private async resolve(entry: PendingVault, target: string): Promise<void> {
        let failures = 0;
        for (;;) {
            try {
                const receipt = await this.options.submit(entry.endpoint, entry.payload);
                if (receipt.ok !== true) throw new Error('Missing committed vault receipt');
                // Failure to remove a confirmed record is retried too; never roll back after commit.
                await fs.unlink(target);
                return;
            } catch {
                if (failures++ % 12 === 0) this.options.warn?.();
                await (this.options.delay?.() ?? new Promise<void>(resolve => setTimeout(resolve, 5000)));
            }
        }
    }

    async recover(): Promise<void> {
        await fs.mkdir(this.options.directory, { recursive: true });
        for (const name of (await fs.readdir(this.options.directory)).sort()) {
            if (!name.endsWith('.json')) continue;
            const target = path.join(this.options.directory, name);
            const entry = JSON.parse(await fs.readFile(target, 'utf8')) as PendingVault;
            this.validate(entry);
            if (name !== `${entry.operationId}.json`) throw new Error('Vault journal filename mismatch');
            await this.resolve(entry, target);
        }
    }
}
