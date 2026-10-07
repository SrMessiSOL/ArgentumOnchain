param([switch]$Once,[switch]$ForceBackup)
$ErrorActionPreference='Stop'
$workRoot=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'work'
do{
 try{
    # Restart only a missing tracked service; the launcher refuses unknown port owners.
    & (Join-Path $PSScriptRoot 'Start-AOWeb.ps1') -NoWeb -NoMaintenance | Out-Null
    $game=Invoke-RestMethod 'http://127.0.0.1:7766/health' -TimeoutSec 5
    if(!$game.ready){throw 'Game is not ready'}
    $latest=Get-ChildItem -LiteralPath (Join-Path $workRoot 'backups') -Filter '*.receipt.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if($ForceBackup -or !$latest -or ((Get-Date)-$latest.LastWriteTime).TotalMinutes -ge 30){
        $tokenLine=Get-Content (Join-Path $PSScriptRoot 'server/.env') | Where-Object {$_ -match '^TOKEN_AUTH='} | Select-Object -First 1
        $save=Invoke-RestMethod 'http://127.0.0.1:7766/internal/save' -Method Post -Headers @{Authorization=$tokenLine.Substring(11)} -TimeoutSec 30
        if(!$save.ok){throw 'Skipping backup after failed world save'}
        & (Join-Path $PSScriptRoot 'Backup-AOWeb.ps1')
        $ForceBackup=$false
    }
    @{checkedAt=(Get-Date).ToUniversalTime().ToString('o');ok=$true;game=$game;backupIntervalMinutes=30} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $workRoot 'maintenance-status.json')
 }catch{
    @{checkedAt=(Get-Date).ToUniversalTime().ToString('o');ok=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content (Join-Path $workRoot 'maintenance-status.json')
    Write-Warning $_.Exception.Message
    if($Once){exit 1}
 }
 if(!$Once){Start-Sleep -Seconds 30}
}while(!$Once)
