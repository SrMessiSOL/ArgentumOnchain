# Windows desktop handoff

The intended desktop has an Intel Core i5-11400 and 32 GB RAM, as reported by its owner. Capacity and continuous availability have not been verified.

## First check

Copy `Inspect-WindowsHost.ps1` to that desktop and run from the folder containing it:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Inspect-WindowsHost.ps1
```

`ExecutionPolicy Bypass` applies only to this invocation; the script does not change machine policy. It reads hardware, Windows version, available tools, firewall/antivirus status, sleep settings, and realm-port listeners. It does not install software or change system settings. Return `aochain-host-report.json` for review. The report excludes credentials, wallet keys, usernames, public IP addresses and machine identifiers.

## Setup sequence after the check

1. Verify supported Windows and runtime versions, storage, Ethernet connectivity and power settings. Use official installers for Git, Node.js and PostgreSQL; pin the Node/package-manager versions used in the validated build.
2. Create separate unprivileged identities for public web/API, game, database operations and signer custody. The web/API identity must not be able to read authority keys or protected backup files. Do not copy authority keys into the source checkout or upload them to chat/GitHub.
3. Install the application from the owner fork and generate separate operations/game credentials on the host. Keep PostgreSQL, API, game and gateway listeners on loopback. Do not forward their ports through the router.
4. Transfer a verified world-save checkpoint through a private encrypted archive. Existing Windows DPAPI bundles cannot be assumed decryptable on this different Windows user profile. Verify the destination restore in an isolated database before selecting it as the realm database.
5. Configure production web builds, a stable TLS origin and durable metadata hosting, recovery workers, service startup, private logs, off-host encrypted backups and alerts. Existing `Start-AOWeb.ps1` depends on the prepared development workspace and is not a portable installer.
6. Rehearse wallet lifecycle, outages and restoration; run the 100-player workload on this machine. Record latency, CPU/memory, database/RPC load, connection limits and state integrity. An idle socket test alone does not establish gameplay capacity.

Use [the community testing gate](COMMUNITY-TESTING-GATE.md) to track required evidence. No public launch or mainnet readiness is implied by a successful host inspection.
