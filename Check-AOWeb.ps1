$ErrorActionPreference='Stop'
$results=@{}
foreach($service in @(@{name='api';url='http://127.0.0.1:3101/health'},@{name='game';url='http://127.0.0.1:7766/health'})){
 try{$results[$service.name]=Invoke-RestMethod $service.url -TimeoutSec 5}catch{$results[$service.name]=@{ready=$false;error='Unreachable'}}
}
$runtimePath=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'work/aoweb-runtime.json'
$results.devnetConfigured=Test-Path -LiteralPath $runtimePath
$results.checkedAt=(Get-Date).ToUniversalTime().ToString('o')
$results | ConvertTo-Json -Depth 5
if($results.game.ready -ne $true -or $results.api.error){exit 1}
