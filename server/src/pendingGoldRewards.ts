import type { BankOperationGuard } from './bankOperationGuard';

export class PendingGoldRewards<T> {
    private credits = new Map<string | number, { target: T; amount: number }>();
    constructor(private guard: BankOperationGuard, private apply: (target: T, amount: number) => void) {}
    credit(id: string | number, target: T, amount: number): void {
        if (!Number.isSafeInteger(amount) || amount <= 0) return;
        if (!this.guard.isBusy(id)) { this.apply(target, amount); return; }
        const previous = this.credits.get(id);
        if (previous && previous.target !== target) throw Error('Reward target changed during a pending operation');
        this.credits.set(id, { target, amount: Math.min(2147483647, (previous?.amount ?? 0) + amount) });
        this.guard.onSettled(id, 'npc-gold-reward', () => {
            const credit = this.credits.get(id);
            this.credits.delete(id);
            if (credit) this.apply(credit.target, credit.amount);
        });
    }
}
