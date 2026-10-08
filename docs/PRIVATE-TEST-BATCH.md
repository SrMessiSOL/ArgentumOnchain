# Grouped private host preparation

The intended Windows workspace now has `outputs/Complete-PrivateTestPreparation.ps1`. This is an operational tool for that existing host, not a portable installer. It requires Administrator PowerShell and never activates the signer or opens the gateway.

The batch runs host/security and signer-boundary checks, complete disposable regressions, then an eight-client ten-minute gameplay rehearsal. The rehearsal exercises real API/game processes, movement and melee packets, inventory persistence, periodic saves, API interruption with pending journals, game restarts, reconnection and encrypted logical restore. Ownership is explicitly simulated and NPCs are controlled weak fixtures. It records client loop lag and save durations; these are not server tick latency or a production capacity certification. Two-player regression mode remains the default outside this batch.

Only if code regressions and gameplay succeed does the batch update the guarded API/game code. Dependency lockfiles must match the installed packages, the gateway must be closed, settlement must be paused and no players may be connected. An authenticated online backup precedes the restart. Staged code hashes are verified, previous code is retained, and a failed health check triggers rollback. Credentials, authority files, database contents and runtime journals are not replaced. The signer stays disabled.

The batch continues independent backup/restore, tunnel and proxy checks after a failure and records every result in `outputs/private-preparation-batch-result.json`. Cloud verification is attempted once and respects the uploader's existing provider cooldown. It does not repeatedly restart uploads to work around Google quotas.

Validation so far: extended harness and PowerShell syntax passed; mocked batch execution verified failure propagation and that child output cannot turn a failed check into success. Elevated execution of the new extended rehearsal and guarded deployment remains pending. Earlier two-client combat/outage/logical-restore evidence is not evidence that this new eight-client rehearsal passed.

The remaining release requirements are separate from this batch: complete isolated signer activation and cosmetic/tokenized-market integration; real-wallet devnet lifecycle and external browser testing; a physical VSS snapshot during active gameplay; independent recovery-key availability/restore; external alert delivery; and a current verified off-host archive. None are automatically approved by successful compilation or a simulated ownership fixture.
