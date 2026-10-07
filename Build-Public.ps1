param([string]$DistDir='.next-public-en',[string]$BuildId='english-complete-20261004')
$ErrorActionPreference='Stop'
$workRoot=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'work'
$public=Get-Content -LiteralPath (Join-Path $workRoot 'aoweb-public.json') -Raw | ConvertFrom-Json
if($public.distDir -eq $DistDir){throw 'Choose an inactive build directory; the active website must not be overwritten.'}
if($DistDir -notmatch '^\.next-public-[a-z0-9-]+$'){throw 'Invalid build directory'}
$env:NEXT_DIST_DIR=$DistDir
$env:NEXT_BUILD_ID=$BuildId
$env:NEXT_PUBLIC_SITE_URL=$public.url
$env:NEXT_PUBLIC_WS_URL='/game-socket'
$env:NEXT_TELEMETRY_DISABLED='1'
Push-Location (Join-Path $PSScriptRoot 'frontend')
try {
    & npm.cmd run test:english
    if($LASTEXITCODE -ne 0){throw 'English release checks failed'}
    # Type-check the current release's generated routes, never old development
    # or inactive release caches. Keep all application files and strict checks.
    $baseConfig=Get-Content -LiteralPath 'tsconfig.json' -Raw | ConvertFrom-Json
    $inactiveCaches=@(Get-ChildItem -Directory -Force | Where-Object {$_.Name -like '.next*' -and $_.Name -ne $DistDir} | ForEach-Object {$_.Name+'/**'})
    $buildConfigName='.tsconfig-public-'+$DistDir.Substring('.next-public-'.Length)+'.json'
    $buildConfig=@{
        extends='./tsconfig.json'
        include=@('next-env.d.ts','**/*.ts','**/*.tsx',"$DistDir/types/**/*.ts","$DistDir/dev/types/**/*.ts")
        exclude=@($baseConfig.exclude)+$inactiveCaches
    }
    $buildConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $buildConfigName
    $env:NEXT_TSCONFIG_PATH=$buildConfigName
    & npm.cmd run build
    if($LASTEXITCODE -ne 0){throw 'Frontend build failed'}
}
finally { Pop-Location }
