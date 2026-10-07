# Operational scripts

Run these from the repository root in PowerShell:

```powershell
./scripts/Start-AOWeb.ps1
./scripts/Check-AOWeb.ps1
./scripts/Backup-AOWeb.ps1 -VerifyRestore
./scripts/Stop-AOWeb.ps1 -KeepDatabase
```

`Maintain-AOWeb.ps1` monitors the prepared local services; `Build-Public.ps1` builds an inactive public frontend directory; `Stop-Public.ps1` disables the public preview. `public-gateway.cjs` forwards public web/game traffic using the private runtime configuration supplied as its argument.

These scripts require the prepared workspace's private `work/` directory, PostgreSQL installation and service configuration. See [operations](../docs/OPERATIONS.md). Do not expose internal services or publish runtime configuration and backups.

`Inspect-WindowsHost.ps1` is a standalone read-only inspection that can run on the future Windows host without the prepared workspace. See [Windows handoff](../docs/WINDOWS-HOST-HANDOFF.md).
