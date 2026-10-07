param([switch]$KeepDatabase)
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$workRoot=Join-Path $workspaceRoot 'work'
$record=Get-Content (Join-Path $workRoot 'aoweb-processes.json') -Raw | ConvertFrom-Json
$health=Invoke-RestMethod 'http://127.0.0.1:7766/health' -TimeoutSec 5
if($health.players -gt 0){throw 'Players are online. Log characters out normally before stopping; no process was stopped.'}
$maintenanceRecord=Join-Path $workRoot 'aoweb-maintenance.json'
if(Test-Path -LiteralPath $maintenanceRecord){
    $maintenance=Get-Content -LiteralPath $maintenanceRecord -Raw | ConvertFrom-Json
    $keeper=Get-CimInstance Win32_Process -Filter "ProcessId=$($maintenance.pid)"
    if($keeper){
        if($keeper.CommandLine -notlike "*$(Join-Path $PSScriptRoot 'Maintain-AOWeb.ps1')*"){throw 'Maintenance process identity mismatch'}
        Stop-Process -Id $maintenance.pid
    }
}
$tokenLine=Get-Content (Join-Path $PSScriptRoot 'server/.env') | Where-Object {$_ -match '^TOKEN_AUTH='} | Select-Object -First 1
$token=$tokenLine.Substring('TOKEN_AUTH='.Length)
$save=Invoke-RestMethod 'http://127.0.0.1:7766/internal/save' -Method Post -Headers @{Authorization=$token} -TimeoutSec 30
if(!$save.ok){throw 'World save failed; services remain running.'}
& (Join-Path $PSScriptRoot 'Backup-AOWeb.ps1')
foreach($name in @('game','web','api')){
    $taskPid=$record.$name
    if(!$taskPid){continue}
    $service=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid"
    if(!$service){continue}
    $port=if($name -eq 'game'){7766}elseif($name -eq 'api'){3101}else{3100}
    $listener=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    $matches=if($name -eq 'web'){$service.CommandLine -like '*node_modules/next/dist/bin/next*3100*'}else{$service.CommandLine -like '*--import tsx src/server.ts*'}
    $ownsPort=$listener.OwningProcess -contains $taskPid
    $children=@()
    if(!$ownsPort -and $name -eq 'web'){
        foreach($owner in $listener.OwningProcess){
            $child=Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
            if($child.ParentProcessId -eq $taskPid -and $child.CommandLine -like "*$(Join-Path $PSScriptRoot 'frontend')*start-server.js*"){$children+=$owner;$ownsPort=$true}
        }
    }
    if(!$matches -or !$ownsPort){throw "Identity mismatch for $name; refusing to stop it"}
    foreach($childPid in $children){Stop-Process -Id $childPid}
    Stop-Process -Id $taskPid
}
if(!$KeepDatabase){
    & 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D (Join-Path $workRoot 'aoweb-postgres') -m fast -w stop
    if($LASTEXITCODE -ne 0){throw 'Database stop failed'}
}
Write-Host 'Local game stopped after a successful save and backup.'
