param([string]$OutputPath=(Join-Path $PSScriptRoot 'aochain-host-report.json'))
$ErrorActionPreference='Stop'
# Read-only: no installs, firewall/power changes, credentials, IPs or machine identifiers.
$cpu=Get-CimInstance Win32_Processor
$system=Get-CimInstance Win32_ComputerSystem
$os=Get-CimInstance Win32_OperatingSystem
$disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
function VersionOf([string]$Name,[string[]]$VersionArguments){
 if(!(Get-Command $Name -ErrorAction SilentlyContinue)){return $null}
 try{$result=& $Name @VersionArguments 2>$null;if($LASTEXITCODE -eq 0){return (($result|Select-Object -First 1).ToString().Trim())}}catch{}
 return $null
}
$pnpmAvailable=$null;if(Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue){$pnpmAvailable='Available; version will be checked during setup'}
$tools=@{git=(VersionOf 'git.exe' @('--version'));node=(VersionOf 'node.exe' @('--version'));pnpm=$pnpmAvailable;postgres=(VersionOf 'psql.exe' @('--version'));winget=(VersionOf 'winget.exe' @('--version'))}
$firewall=@();try{$firewall=@(Get-NetFirewallProfile|Select-Object Name,Enabled)}catch{}
$defender=$null;try{$status=Get-MpComputerStatus;$defender=@{antivirusEnabled=$status.AntivirusEnabled;realTimeProtectionEnabled=$status.RealTimeProtectionEnabled}}catch{}
$adapters=@();try{$adapters=@(Get-NetAdapter -Physical|Where-Object Status -eq 'Up'|Select-Object LinkSpeed,MediaType,PhysicalMediaType)}catch{}
$sleepAc=$null;$sleepDc=$null
try{$power=& powercfg.exe /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null;if($LASTEXITCODE -eq 0){$indices=[regex]::Matches(($power -join "`n"),'0x([0-9a-fA-F]{8})');if($indices.Count -ge 2){$sleepAc=[Convert]::ToInt64($indices[$indices.Count-2].Groups[1].Value,16);$sleepDc=[Convert]::ToInt64($indices[$indices.Count-1].Groups[1].Value,16)}}}catch{}
$listeners=@();try{$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object LocalPort -in @(3101,3102,3103,7766,55432)|Select-Object LocalAddress,LocalPort)}catch{}
$issues=New-Object System.Collections.Generic.List[string]
if(!$os.OSArchitecture.Contains('64')){$issues.Add('A 64-bit Windows installation is required.')}
if($system.TotalPhysicalMemory -lt 16GB){$issues.Add('Less than 16 GB RAM: test capacity before selecting a player limit.')}
if($disk.FreeSpace -lt 20GB){$issues.Add('Less than 20 GB free on the system disk.')}
if($sleepAc -ne $null -and $sleepAc -gt 0){$issues.Add('Windows sleeps on AC power; continuous hosting needs a reviewed power setting.')}
if($sleepAc -eq $null){$issues.Add('Could not verify the AC sleep setting.')}
if($firewall.Count -eq 0){$issues.Add('Could not verify firewall status.')}
if(@($firewall|Where-Object Enabled -eq $false).Count -gt 0){$issues.Add('At least one firewall profile is disabled.')}
if(!$defender){$issues.Add('Could not verify Defender status; check the active antivirus manually.')}
foreach($name in @('git','node','pnpm','postgres')){if(!$tools[$name]){$issues.Add("Required tool not found on PATH: $name")}}
$report=[ordered]@{checkedAt=(Get-Date).ToUniversalTime().ToString('o');mode='read-only';windows=@{name=$os.Caption;build=$os.BuildNumber;architecture=$os.OSArchitecture};cpu=@{name=($cpu.Name -join ', ');logicalProcessors=($cpu.NumberOfLogicalProcessors|Measure-Object -Sum).Sum};memoryGB=[Math]::Round($system.TotalPhysicalMemory/1GB,1);systemDiskFreeGB=[Math]::Round($disk.FreeSpace/1GB,1);physicalNetwork=$adapters;tools=$tools;firewall=$firewall;defender=$defender;sleepOnAcSeconds=$sleepAc;sleepOnBatterySeconds=$sleepDc;realmPortListeners=$listeners;issues=@($issues.ToArray());capacityVerified=$false}
$resolved=[IO.Path]::GetFullPath($OutputPath)
$report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $resolved -Encoding UTF8
Write-Host 'AOCHAIN host check complete. No computer settings were changed.'
Write-Host "Report: $resolved"
Write-Host 'Send this report back for the next setup step. It contains no passwords, keys, usernames or public IP addresses.'
