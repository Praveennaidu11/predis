Param(
  [Parameter(Mandatory=$true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

function Get-EnvOrDefault([string]$Name, [string]$Default) {
  $v = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
  return $v
}

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$dbHost = Get-EnvOrDefault "DB_HOST" "localhost"
$dbPort = Get-EnvOrDefault "DB_PORT" "5432"
$dbUser = Get-EnvOrDefault "DB_USERNAME" "postgres"
$dbName = Get-EnvOrDefault "DB_NAME" "postgres"

Write-Host "Restoring $BackupFile -> $dbHost`:$dbPort/$dbName"

if (-not [string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) {
  $env:PGPASSWORD = $env:DB_PASSWORD
}

& gzip -dc $BackupFile `
  | & pg_restore --host $dbHost --port $dbPort --username $dbUser --dbname $dbName --clean --if-exists --no-owner --no-privileges

Write-Host "Restore complete."

