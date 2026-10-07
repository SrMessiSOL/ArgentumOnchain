$ErrorActionPreference = 'Stop'
$trialWorkspace = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$trialWork = Join-Path $trialWorkspace 'work'
$configPath = Join-Path $trialWork 'aoweb-public.json'
if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $config.enabled = $false
    $config | ConvertTo-Json | Set-Content -LiteralPath $configPath
}
$recordPath = Join-Path $trialWork 'aoweb-public-processes.json'
if (Test-Path -LiteralPath $recordPath) {
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    foreach ($name in @('tunnel','gateway','web')) {
        $processId = $record.$name
        if (!$processId) { continue }
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
        if (!$process) { continue }
        $expected = switch ($name) {
            'tunnel' { $process.ExecutablePath -eq (Join-Path $trialWork 'cloudflared.exe') -and $process.CommandLine -like '*127.0.0.1:3103*' }
            'gateway' { $process.CommandLine -like '*public-gateway.cjs*' -and $process.CommandLine -like "*$trialWork*" }
            'web' { $process.CommandLine -like '*node_modules/next/dist/bin/next*start*3102*' }
        }
        if (!$expected) { throw "Process $processId no longer matches the public $name service; not stopped." }
        Stop-Process -Id $processId
    }
}
Write-Host 'Public access stopped. Local game, API and database remain running.'
