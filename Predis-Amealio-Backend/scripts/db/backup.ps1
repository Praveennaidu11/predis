Param(
  [string]$BackupDir = $env:BACKUP_DIR,
  [int]$KeepDays = 0
)

$ErrorActionPreference = "Stop"

function Get-EnvOrDefault([string]$Name, [string]$Default) {
  $v = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
  return $v
}

$dbHost = Get-EnvOrDefault "DB_HOST" "localhost"
$dbPort = Get-EnvOrDefault "DB_PORT" "5432"
$dbUser = Get-EnvOrDefault "DB_USERNAME" "postgres"
$dbName = Get-EnvOrDefault "DB_NAME" "postgres"

if ([string]::IsNullOrWhiteSpace($BackupDir)) {
  $BackupDir = ".\backups"
}

if ($KeepDays -eq 0) {
  $keepEnv = [Environment]::GetEnvironmentVariable("BACKUP_KEEP_DAYS")
  if (-not [string]::IsNullOrWhiteSpace($keepEnv)) {
    [int]::TryParse($keepEnv, [ref]$KeepDays) | Out-Null
  }
  if ($KeepDays -le 0) { $KeepDays = 14 }
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$fileName = "$dbName" + "_" + "$ts" + ".dump.gz"
$outFile = Join-Path $BackupDir $fileName

Write-Host "Backing up $dbHost`:$dbPort/$dbName -> $outFile"

if (-not [string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) {
  $env:PGPASSWORD = $env:DB_PASSWORD
}

# pg_dump custom format piped to gzip
& pg_dump --host $dbHost --port $dbPort --username $dbUser --format=custom --no-owner --no-privileges $dbName `
  | & gzip -c `
  | Set-Content -Encoding Byte -Path $outFile

Write-Host "Backup complete."

# Local retention (best-effort)
$cutoff = (Get-Date).ToUniversalTime().AddDays(-$KeepDays)
Get-ChildItem -Path $BackupDir -Filter "*.dump.gz" -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTimeUtc -lt $cutoff } |
  ForEach-Object { Remove-Item -Force $_.FullName }

# Optional S3 upload
$s3Bucket = $env:S3_BUCKET
if (-not [string]::IsNullOrWhiteSpace($s3Bucket)) {
  $aws = Get-Command aws -ErrorAction SilentlyContinue
  if ($null -eq $aws) {
    Write-Warning "S3_BUCKET set but aws CLI not found; skipping upload."
    exit 0
  }

  $s3Prefix = $env:S3_PREFIX
  if ([string]::IsNullOrWhiteSpace($s3Prefix)) { $s3Prefix = "predis/amealio-db" }
  $s3Prefix = $s3Prefix.TrimEnd("/")

  $s3Key = "$s3Prefix/$fileName"
  $dest = "s3://$s3Bucket/$s3Key"

  $extra = @()
  if (-not [string]::IsNullOrWhiteSpace($env:S3_SSE)) {
    $extra += "--sse"
    $extra += $env:S3_SSE
    if ($env:S3_SSE -eq "aws:kms" -and (-not [string]::IsNullOrWhiteSpace($env:S3_KMS_KEY_ID))) {
      $extra += "--sse-kms-key-id"
      $extra += $env:S3_KMS_KEY_ID
    }
  }

  Write-Host "Uploading to $dest"
  & aws s3 cp $outFile $dest @extra | Out-Null
  Write-Host "S3 upload complete."
}

