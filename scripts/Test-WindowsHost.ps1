param(
 [Parameter(Mandatory=$true)][string]$NodeExe,
 [Parameter(Mandatory=$true)][string]$PnpmCjs,
 [Parameter(Mandatory=$true)][string]$PgBin,
 [Parameter(Mandatory=$true)][string]$TestRoot,
 [ValidateRange(1024,65535)][int]$Port=55433,
 [switch]$GameplayOnly,
 [switch]$ItemsOnly
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$root=[IO.Path]::GetFullPath($TestRoot)
$started=$false
$receipt=[ordered]@{startedAt=[DateTime]::UtcNow.ToString('o');mode='disposable-regressions';checks=@();passed=$false;databaseStopped=$false;error=$null}
$savedEnv=@{}
function Run-Check([string]$Name,[string]$Directory,[string[]]$Arguments) {
 Push-Location $Directory
 try {
  & $NodeExe @Arguments
  $code=$LASTEXITCODE
  $receipt.checks+=@{name=$Name;exitCode=$code;passed=($code -eq 0)}
  if($code -ne 0){throw "$Name failed; inspect private terminal output"}
 } finally {Pop-Location}
}
try {
 $NodeExe=(Resolve-Path -LiteralPath $NodeExe).Path
 $PnpmCjs=(Resolve-Path -LiteralPath $PnpmCjs).Path
 $PgBin=(Resolve-Path -LiteralPath $PgBin).Path
 $nodeVersion=(& $NodeExe --version).Trim()
 if($nodeVersion -notmatch '^v24\.') {throw 'This host runner requires the validated Node 24 release line'}
 if(Test-Path -LiteralPath $root){throw 'TestRoot must be a new directory; existing directories are never reused or deleted'}
 if($root -eq [IO.Path]::GetPathRoot($root)){throw 'TestRoot cannot be a drive root'}
 New-Item -ItemType Directory -Path $root|Out-Null
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 & icacls.exe $root /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Cannot protect test directory; no credentials or database created'}
 # Only the current user and SYSTEM may access these test credentials.
 $acl=Get-Acl -LiteralPath $root
 if(!$acl.AreAccessRulesProtected){throw 'Test directory still inherits permissions'}
 foreach($entry in $acl.Access){
  $entrySid=$entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if($entry.AccessControlType -eq 'Allow' -and $entrySid -notin @($sid,'S-1-5-18')){throw 'Unexpected test directory reader'}
 }
 $secretBytes=New-Object byte[] 32
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try {$rng.GetBytes($secretBytes)} finally {$rng.Dispose()}
 $password=[Convert]::ToBase64String($secretBytes)
 $pwfile=Join-Path $root 'postgres-password.txt'
 [IO.File]::WriteAllText($pwfile,$password+"`n",(New-Object Text.UTF8Encoding($false)))
 $data=Join-Path $root 'data'
 & (Join-Path $PgBin 'initdb.exe') -D $data -U aochain_test_admin --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8 "--pwfile=$pwfile"
 if($LASTEXITCODE -ne 0){throw 'Disposable initdb failed'}
 & (Join-Path $PgBin 'pg_ctl.exe') -D $data -l (Join-Path $root 'postgres.log') -o "-h 127.0.0.1 -p $Port" -w start
 if($LASTEXITCODE -ne 0){throw 'Disposable PostgreSQL startup failed; no realm process was changed'}
 $started=$true
 $keys=@('PATH','AOCHAIN_SECURITY_ADMIN_DATABASE_URL','DATABASE_URL','TOKEN_AUTH','GAME_SERVICE_TOKEN','NODE_ENV','NEXT_TELEMETRY_DISABLED','AOWEB_GOLD_AUTHORITY_FILE','AOWEB_DEVNET_ISSUER_FILE','AOWEB_DEVNET_RPC','AOWEB_SETTLEMENT_PAUSED')
 foreach($key in $keys){$savedEnv[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
 $env:PATH=(Split-Path $NodeExe -Parent)+';'+$env:PATH
 $env:NODE_ENV='test'
 $env:NEXT_TELEMETRY_DISABLED='1'
 $env:AOCHAIN_SECURITY_ADMIN_DATABASE_URL='postgresql://aochain_test_admin:'+ [Uri]::EscapeDataString($password)+"@127.0.0.1:$Port/postgres"
 $env:DATABASE_URL=$env:AOCHAIN_SECURITY_ADMIN_DATABASE_URL
 $env:AOWEB_GOLD_AUTHORITY_FILE=$null
 $env:AOWEB_DEVNET_ISSUER_FILE=$null
 $env:AOWEB_DEVNET_RPC=$null
 # These endpoint tests mock signing/RPC and need to exercise unpaused paths.
 # The actual realm's protected environment remains paused and is never loaded.
 $env:AOWEB_SETTLEMENT_PAUSED='0'
 if($ItemsOnly){
  $savedEnv['AOCHAIN_SECURITY_SCOPE']=[Environment]::GetEnvironmentVariable('AOCHAIN_SECURITY_SCOPE','Process')
  $env:AOCHAIN_SECURITY_SCOPE='items'
  $env:TOKEN_AUTH='test-only-operations-'+[Guid]::NewGuid().ToString('N')
  $env:GAME_SERVICE_TOKEN='test-only-game-'+[Guid]::NewGuid().ToString('N')
  Run-Check 'Item export, NPC eligibility, escrow and settlement regressions' (Join-Path $repo 'api') @('scripts/security-regressions.cjs')
 } elseif(!$GameplayOnly){
 foreach($package in @('api','server','frontend')){
  Run-Check "$package frozen install" (Join-Path $repo $package) @($PnpmCjs,'install','--frozen-lockfile')
 }
 foreach($package in @('api','server')){
  Run-Check "$package TypeScript" (Join-Path $repo $package) @('node_modules/typescript/bin/tsc')
  Run-Check "$package assets" (Join-Path $repo $package) @('scripts/copy-assets.cjs')
 }
 $env:TOKEN_AUTH='test-only-operations-'+[Guid]::NewGuid().ToString('N')
 Run-Check 'Offline signer policy and journal' (Join-Path $repo 'api') @('scripts/signer-policy.test.cjs')
 Run-Check 'Signer isolation and lifetime budgets' (Join-Path $repo 'api') @('scripts/signer-isolation.test.cjs')
 Run-Check 'Private wallet settlement guards' (Join-Path $repo 'api') @('scripts/private-wallet-policy.test.cjs')
 Run-Check 'Devnet mint exact transaction' (Join-Path $repo 'api') @('scripts/provision-devnet.test.cjs')
 Run-Check 'Signer activation configuration guards' (Join-Path $repo 'api') @('scripts/signer-activation.test.cjs')
 Run-Check 'Signer HTTP protocol isolation' (Join-Path $repo 'api') @('scripts/signer-http.test.cjs')
 Run-Check 'Signer cosmetic and character marketplace lifecycle' (Join-Path $repo 'api') @('scripts/signer-lifecycle.test.cjs')
 Run-Check 'Cosmetic signed-byte persistence and recovery' (Join-Path $repo 'api') @('scripts/cosmetic-recovery.test.cjs')
 Run-Check 'Signer database reader isolation' (Join-Path $repo 'api') @('scripts/signer-reader.test.cjs')
 Run-Check 'Loopback RPC outage transport' (Join-Path $repo 'api') @('scripts/rpc-outage-rehearsal.cjs')
 Run-Check 'Backup authenticated encryption' $repo @('scripts/realm-backup-crypto.test.cjs')
 Run-Check 'Encrypted pending journal recovery fixture' (Join-Path $repo 'server') @('tests/backup-pending-recovery.test.cjs')
 Run-Check 'Bounded API read transport recovery' (Join-Path $repo 'server') @('tests/api-request.test.cjs')
 $env:GAME_SERVICE_TOKEN='test-only-game-'+[Guid]::NewGuid().ToString('N')
 Run-Check 'API isolated security suite' (Join-Path $repo 'api') @('scripts/security-regressions.cjs')
 Run-Check 'Server security suite' (Join-Path $repo 'server') @($PnpmCjs,'run','test:security')
 # Neither runtime credentials nor the disposable administrator URL go to web builds.
 $env:TOKEN_AUTH=$null
 $env:GAME_SERVICE_TOKEN=$null
 $env:DATABASE_URL=$null
 $env:AOCHAIN_SECURITY_ADMIN_DATABASE_URL=$null
 Run-Check 'English regressions' (Join-Path $repo 'frontend') @('scripts/test-english.mjs')
 $env:NODE_ENV='production'
 Run-Check 'Frontend production build' (Join-Path $repo 'frontend') @('node_modules/next/dist/bin/next','build')
 } else {
  if($Port -ne 55433){throw 'Gameplay fixture requires the disposable port 55433'}
  Run-Check 'Bounded API read transport recovery' (Join-Path $repo 'server') @('tests/api-request.test.cjs')
  $fixtureWorkspace=[IO.Directory]::GetParent([IO.Directory]::GetParent($repo).FullName).FullName
  Run-Check 'Two-player isolated gameplay and restart' $repo @('server/scripts/gameplay-rehearsal.cjs',$root,(Join-Path $fixtureWorkspace 'outputs/New-realm-seed.sql'),$PgBin)
 }
 $receipt.passed=$true
} catch {
 # Do not include connection strings or exception dumps in the public receipt.
 $receipt.error='Preparation or a regression failed. Review terminal output privately.'
 Write-Host 'Host regression run did not pass. No realm migration or public deployment occurred.'
} finally {
 if($started){
  & (Join-Path $PgBin 'pg_ctl.exe') -D $data -m fast -w stop
  $receipt.databaseStopped=($LASTEXITCODE -eq 0)
  if(!$receipt.databaseStopped){$receipt.passed=$false}
 }
 foreach($key in $savedEnv.Keys){[Environment]::SetEnvironmentVariable($key,$savedEnv[$key],'Process')}
 $password=$null
 if($secretBytes){[Array]::Clear($secretBytes,0,$secretBytes.Length)}
 $receipt.finishedAt=[DateTime]::UtcNow.ToString('o')
 if(Test-Path -LiteralPath $root){$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $root 'regression-receipt.json') -Encoding UTF8}
}
if(!$receipt.passed){exit 1}
Write-Host 'Disposable host regression checks passed; public release gates remain separate.'
