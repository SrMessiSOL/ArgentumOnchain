param([switch]$VerifyRestore,[switch]$RequireQuiescent)
$ErrorActionPreference='Stop'
if($RequireQuiescent){
 foreach($port in @(3101,7766)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Stop the API and game services before a checkpoint backup.'}}
}
$workspaceRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$previousPgPassword=$env:PGPASSWORD
$credentialFile=Join-Path $workspaceRoot 'work/database-admin.dpapi'
if(Test-Path -LiteralPath $credentialFile){
 $protectedCredential=Get-Content -LiteralPath $credentialFile -Raw|ConvertTo-SecureString
 $adminConnection=[System.Net.NetworkCredential]::new('', $protectedCredential).Password
 $env:PGPASSWORD=[Uri]::UnescapeDataString(([Uri]$adminConnection).UserInfo.Split(':',2)[1])
 $adminConnection=$null
}
try {
$backupRoot=Join-Path $workspaceRoot 'work/backups'
$pgBin='C:\Program Files\PostgreSQL\16\bin'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$archive=Join-Path $backupRoot "aoweb-$stamp.dump"
& "$pgBin/pg_dump.exe" -h 127.0.0.1 -p 55432 -U aoweb_local -d aoweb_local --format=custom --file=$archive
if($LASTEXITCODE -ne 0){throw 'Backup failed; live database was not modified.'}
$report=@{createdAt=(Get-Date).ToUniversalTime().ToString('o');archive=$archive;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash;bytes=(Get-Item -LiteralPath $archive).Length;restoreVerified=$false}
$secretBundle=@{}
foreach($relative in @('api/.env','server/.env','frontend/.env.local')){
 $source=Join-Path $PSScriptRoot $relative
 if(Test-Path -LiteralPath $source){$secretBundle[$relative]=[IO.File]::ReadAllText($source)}
}
$runtimeFile=Join-Path $workspaceRoot 'work/aoweb-runtime.json'
if(Test-Path -LiteralPath $runtimeFile){
 $secretBundle['runtime.json']=[IO.File]::ReadAllText($runtimeFile)
 $runtime=Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
 if($runtime.devnetEnabled -and (Test-Path -LiteralPath $runtime.issuerFile)){$secretBundle['dedicated-devnet-issuer.json']=[IO.File]::ReadAllText($runtime.issuerFile)}
}
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
foreach($journalName in @('vault-operations','character-operations','world-operations','market-operations')){
 $journalDirectory=Join-Path $workspaceRoot ('work/'+$journalName)
 if(Test-Path -LiteralPath $journalDirectory){
  foreach($entry in Get-ChildItem -LiteralPath $journalDirectory -Filter '*.json' -File){
   $secretBundle[($journalName+'/'+$entry.Name)]=[IO.File]::ReadAllText($entry.FullName)
  }
 }
}
$plain=[Text.Encoding]::UTF8.GetBytes(($secretBundle | ConvertTo-Json -Depth 5))
$cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$protectedFile="$archive.runtime.dpapi"
[IO.File]::WriteAllBytes($protectedFile,$cipher)
$roundTrip=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
if([Convert]::ToBase64String($plain) -ne [Convert]::ToBase64String($roundTrip)){throw 'Protected runtime backup verification failed'}
$report.quiescentVerified=[bool]$RequireQuiescent
$report.runtimeBackup=$protectedFile
$report.runtimeProtection='Windows DPAPI CurrentUser; restore requires this Windows user profile'
$report.runtimeRoundTripVerified=$true
[Array]::Clear($plain,0,$plain.Length)
[Array]::Clear($roundTrip,0,$roundTrip.Length)
if($VerifyRestore){
 $restoreDb='aoweb_restore_'+(Get-Date -Format 'yyyyMMddHHmmssfff')
 if($restoreDb -notmatch '^aoweb_restore_\d+$'){throw 'Unsafe restore target'}
 & "$pgBin/createdb.exe" -h 127.0.0.1 -p 55432 -U aoweb_local $restoreDb
 if($LASTEXITCODE -ne 0){throw 'Could not create isolated restore database'}
 & "$pgBin/pg_restore.exe" -h 127.0.0.1 -p 55432 -U aoweb_local --exit-on-error -d $restoreDb $archive
 if($LASTEXITCODE -ne 0){throw "Restore failed in isolated database $restoreDb"}
 $counts=& "$pgBin/psql.exe" -h 127.0.0.1 -p 55432 -U aoweb_local -d $restoreDb -At -c 'SELECT json_build_object(''accounts'',(SELECT count(*) FROM accounts),''characters'',(SELECT count(*) FROM characters),''objects'',(SELECT count(*) FROM game_objects),''npcs'',(SELECT count(*) FROM game_npcs),''claims'',(SELECT count(*) FROM cosmetic_claims));'
 if($LASTEXITCODE -ne 0){throw 'Restored database validation failed'}
 $report.restoreVerified=$true
 $report.restoreDatabase=$restoreDb
 $report.restoredCounts=$counts | ConvertFrom-Json
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$archive.receipt.json"
$report | ConvertTo-Json -Depth 5
# Never restore over the live database or copy private issuer/player keys into distributable output.

} finally { $env:PGPASSWORD=$previousPgPassword }
