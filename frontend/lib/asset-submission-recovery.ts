/** A lost submit response is not proof of a failed transaction. Use persisted state. */
export function assetSubmissionRecovery(
    operations: ReadonlyArray<{ id: string; state: string }>,
    operationId: string | null,
    submissionStarted: boolean,
): 'complete' | 'pending' | null {
    if (!submissionStarted || !operationId) return null;
    const operation = operations.find(value => value.id === operationId);
    if (operation?.state === 'complete') return 'complete';
    if (operation?.state === 'prepared' || operation?.state === 'signed') return 'pending';
    return null;
}
