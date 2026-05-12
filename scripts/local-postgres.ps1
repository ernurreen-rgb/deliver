param(
  [ValidateSet("start", "stop", "status", "psql")]
  [string] $Action = "status"
)

$ErrorActionPreference = "Stop"

$serviceName = if ($env:DELIVER_POSTGRES_SERVICE) {
  $env:DELIVER_POSTGRES_SERVICE
} else {
  "postgresql-x64-17-deliver"
}

$binDir = if ($env:DELIVER_POSTGRES_BIN) {
  $env:DELIVER_POSTGRES_BIN
} else {
  "E:\Apps\PostgreSQL\17\bin"
}

$hostName = if ($env:DELIVER_POSTGRES_HOST) {
  $env:DELIVER_POSTGRES_HOST
} else {
  "localhost"
}

$port = if ($env:DELIVER_POSTGRES_PORT) {
  $env:DELIVER_POSTGRES_PORT
} else {
  "5432"
}

$database = if ($env:DELIVER_POSTGRES_DATABASE) {
  $env:DELIVER_POSTGRES_DATABASE
} else {
  "deliver"
}

$user = if ($env:DELIVER_POSTGRES_USER) {
  $env:DELIVER_POSTGRES_USER
} else {
  "postgres"
}

$pgIsReady = Join-Path $binDir "pg_isready.exe"
$psql = Join-Path $binDir "psql.exe"

function Get-LocalPostgresService {
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

  if (-not $service) {
    throw "PostgreSQL service '$serviceName' was not found. Set DELIVER_POSTGRES_SERVICE if it uses another name."
  }

  return $service
}

function Test-LocalPostgresReady {
  if (-not (Test-Path -LiteralPath $pgIsReady)) {
    throw "pg_isready.exe was not found at '$pgIsReady'. Set DELIVER_POSTGRES_BIN if PostgreSQL is installed elsewhere."
  }

  & $pgIsReady -h $hostName -p $port -d $database -U $user | Out-Host
  return $LASTEXITCODE -eq 0
}

function Show-LocalPostgresStatus {
  $service = Get-LocalPostgresService
  $service | Select-Object Name, Status, DisplayName | Format-Table -AutoSize

  [void](Test-LocalPostgresReady)
}

switch ($Action) {
  "start" {
    $service = Get-LocalPostgresService

    if ($service.Status -ne "Running") {
      Start-Service -Name $serviceName
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      if (Test-LocalPostgresReady) {
        $ready = $true
        break
      }

      Start-Sleep -Seconds 1
    }

    if (-not $ready) {
      throw "PostgreSQL service '$serviceName' started but did not become ready on ${hostName}:${port}."
    }

    Show-LocalPostgresStatus
  }
  "stop" {
    $service = Get-LocalPostgresService

    if ($service.Status -ne "Stopped") {
      Stop-Service -Name $serviceName
    }

    Get-LocalPostgresService | Select-Object Name, Status, DisplayName | Format-Table -AutoSize
  }
  "status" {
    Show-LocalPostgresStatus
  }
  "psql" {
    if (-not (Test-Path -LiteralPath $psql)) {
      throw "psql.exe was not found at '$psql'. Set DELIVER_POSTGRES_BIN if PostgreSQL is installed elsewhere."
    }

    if (-not $env:PGPASSWORD) {
      $env:PGPASSWORD = "postgres"
    }

    & $psql -h $hostName -p $port -U $user -d $database
  }
}
