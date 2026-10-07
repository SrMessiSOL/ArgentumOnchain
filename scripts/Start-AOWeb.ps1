param([switch]$NoWeb,[switch]$NoMaintenance)
$ErrorActionPreference = 'Stop'
$launcherMutex = [System.Threading.Mutex]::new($false, 'Local\AOCHAIN_aoweb_service_launcher')
$launcherAcquired = $false
try {
    try { $launcherAcquired = $launcherMutex.WaitOne(15000) }
    catch [System.Threading.AbandonedMutexException] { $launcherAcquired = $true }
    if (!$launcherAcquired) { throw 'Another service launcher is active; retry shortly.' }
$repoRoot = Split-Path $PSScriptRoot -Parent
$workspaceRoot = Split-Path (Split-Path $repoRoot -Parent) -Parent
$workRoot = Join-Path $workspaceRoot 'work'
$pgBin = 'C:\Program Files\PostgreSQL\16\bin'
$nodeBin = (Get-Command node.exe).Source
$recordPath = Join-Path $workRoot 'aoweb-processes.json'
$processes = @{}
$runtimePath=Join-Path $workRoot 'aoweb-runtime.json'
if(Test-Path -LiteralPath $runtimePath){
    $runtime=Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    if($runtime.devnetEnabled){
        if(!(Test-Path -LiteralPath $runtime.issuerFile)){throw 'Dedicated devnet issuer file is missing'}
        $env:AOWEB_DEVNET_ISSUER_FILE=$runtime.issuerFile
        $env:AOWEB_DEVNET_METADATA_URL=$runtime.metadataUrl
    }
    $env:SITE_URL=$runtime.siteUrl
    if($runtime.characterAchievements){$env:AOWEB_CHARACTER_ACHIEVEMENTS='1'}
    if($runtime.goldMint){$env:AOWEB_GOLD_MINT=$runtime.goldMint;$env:AOWEB_GOLD_AUTHORITY_FILE=$runtime.goldAuthorityFile}
}
if (Test-Path -LiteralPath $recordPath) {
    $oldRecord = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    foreach ($property in $oldRecord.PSObject.Properties) { $processes[$property.Name] = $property.Value }
}
$cluster = Join-Path $workRoot 'aoweb-postgres'
if (!(Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) { throw 'The local database has not been prepared. See LOCAL-START.md.' }
& "$pgBin\pg_ctl.exe" -D $cluster status *> $null
if ($LASTEXITCODE -ne 0) {
    & "$pgBin\pg_ctl.exe" -D $cluster -l (Join-Path $workRoot 'aoweb-postgres.log') -w start
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the isolated database.' }
}
function Start-LocalService([string]$Name, [string]$Folder, [int]$Port, [string[]]$Arguments) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
        $knownId = $processes[$Name]
        $known = if ($knownId) { Get-CimInstance Win32_Process -Filter "ProcessId=$knownId" } else { $null }
        $ownsPort=$listener.OwningProcess -contains $knownId
        if(!$ownsPort -and $Name -eq 'web' -and $known){
            foreach($owner in $listener.OwningProcess){
                $child=Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
                if($child.ParentProcessId -eq $knownId -and $child.ExecutablePath -eq $nodeBin -and $child.CommandLine -like "*$(Join-Path $repoRoot 'frontend')*start-server.js*"){$ownsPort=$true}
            }
        }
        if (!$known -or !$ownsPort -or $known.ExecutablePath -ne $nodeBin -or
            ($Name -eq 'web' -and $known.CommandLine -notlike '*node_modules/next/dist/bin/next*') -or
            ($Name -ne 'web' -and $known.CommandLine -notlike '*--import tsx src/server.ts*')) {
            throw "Port $Port is occupied by a process not tracked by this launcher. It has not been stopped."
        }
        Write-Host "$Name already running."
        return
    }
    $service = Start-Process -FilePath $nodeBin -ArgumentList $Arguments -WorkingDirectory (Join-Path $repoRoot $Folder) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workRoot "aoweb-$Name.stdout.log") -RedirectStandardError (Join-Path $workRoot "aoweb-$Name.stderr.log") -PassThru
    $processes[$Name] = $service.Id
    $processes | ConvertTo-Json | Set-Content -LiteralPath $recordPath
}
Start-LocalService 'api' 'api' 3101 @('--import','tsx','src/server.ts')
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:3101/health' -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
}
if (!$ready) { throw 'API did not become ready; see work/aoweb-api.stderr.log.' }
$env:RESET_CONNECTED_CHARACTERS_ON_STARTUP='true'
Start-LocalService 'game' 'server' 7766 @('--import','tsx','src/server.ts')
$gameReady=$false
for($attempt=0;$attempt -lt 60;$attempt++){
    try{$health=Invoke-RestMethod 'http://127.0.0.1:7766/health' -TimeoutSec 2;if($health.ready){$gameReady=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(!$gameReady){throw 'Game did not become ready; inspect work/aoweb-game.stderr.log'}
$env:NEXT_TELEMETRY_DISABLED = '1'
if(!$NoWeb){Start-LocalService 'web' 'frontend' 3100 @('node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3100')}
if(!$NoMaintenance){
    $maintenanceRecord=Join-Path $workRoot 'aoweb-maintenance.json'
    $running=$false
    if(Test-Path -LiteralPath $maintenanceRecord){
        $maintenance=Get-Content -LiteralPath $maintenanceRecord -Raw | ConvertFrom-Json
        $existing=Get-CimInstance Win32_Process -Filter "ProcessId=$($maintenance.pid)"
        $running=$existing -and $existing.CommandLine -like "*$(Join-Path $PSScriptRoot 'Maintain-AOWeb.ps1')*"
    }
    if(!$running){
        $shellPath=(Get-Process -Id $PID).Path
        $argsLine='-NoProfile -File "'+(Join-Path $PSScriptRoot 'Maintain-AOWeb.ps1')+'"'
        $keeper=Start-Process -FilePath $shellPath -ArgumentList $argsLine -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workRoot 'maintenance.stdout.log') -RedirectStandardError (Join-Path $workRoot 'maintenance.stderr.log') -PassThru
        @{pid=$keeper.Id} | ConvertTo-Json | Set-Content -LiteralPath $maintenanceRecord
    }
}
Write-Host 'AOWeb: http://127.0.0.1:3100'
Write-Host 'Optional Solana wallet: http://127.0.0.1:3100/wallet'
} finally {
    if ($launcherAcquired) { $launcherMutex.ReleaseMutex() }
    $launcherMutex.Dispose()
}
