/** No backlog: duplicate bank actions are ignored until the current action settles. */
export class BankOperationGuard {
    private pending = new Map<string | number, Promise<unknown>>();
    private followUps = new Map<string | number, Map<string, Promise<unknown>>>();
    private settled = new Map<string | number, Map<string, () => void>>();
    hasSettledActions(id: string | number): boolean { return Boolean(this.settled.get(id)?.size); }
    flushSettledActions(id: string | number): void {
        const actions = this.settled.get(id);
        this.settled.delete(id);
        for (const action of actions?.values() ?? []) action();
    }

    onSettled(id: string | number, key: string, action: () => void): void {
        if (!this.isBusy(id)) { action(); return; }
        let actions = this.settled.get(id);
        if (!actions) { actions = new Map(); this.settled.set(id, actions); }
        actions.set(key, action);
    }

    private track<T>(id: string | number, operation: Promise<T>): Promise<T> {
        const tracked = operation.finally(() => {
            if (this.pending.get(id) !== tracked) return;
            try { this.flushSettledActions(id); }
            finally { this.pending.delete(id); }
        });
        this.pending.set(id, tracked);
        return tracked;
    }

    /** Reserve one named world event immediately; duplicate death notifications share it. */
    runAfter(id: string | number, key: string, action: () => Promise<void>): Promise<void> {
        let actions = this.followUps.get(id);
        if (!actions) { actions = new Map(); this.followUps.set(id, actions); }
        const existing = actions.get(key);
        if (existing) return existing as Promise<void>;
        const previous = this.pending.get(id) ?? Promise.resolve();
        const tracked = this.track(id, previous.catch(() => undefined).then(action));
        actions.set(key, tracked);
        return tracked.finally(() => {
            actions!.delete(key);
            if (!actions!.size) this.followUps.delete(id);
        });
    }

    isBusy(id: string | number): boolean {
        return this.pending.has(id);
    }

    run<T>(id: string | number, action: () => Promise<T>, busyResult: T): Promise<T> {
        if (this.isBusy(id)) return Promise.resolve(busyResult);
        // Schedule after registering the guard, so synchronous action entry is protected too.
        const operation = Promise.resolve().then(action);
        return this.track(id, operation);
    }

    async wait(id: string | number): Promise<void> {
        while (this.pending.has(id)) {
            // Failed actions still have to finish their rollback before a save/close proceeds.
            await this.pending.get(id)!.catch(() => undefined);
        }
    }

    after(id: string | number, action: () => void, onError: (error: unknown) => void): void {
        if (!this.isBusy(id)) { action(); return; }
        void this.wait(id).then(action).catch(onError);
    }
}

export const bankOperations = new BankOperationGuard();
