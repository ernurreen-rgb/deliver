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
} elseif (Test-Path -LiteralPath "E:\Apps\PostgreSQL\17\bin\pg_isready.exe") {
  "E:\Apps\PostgreSQL\17\bin"
} else {
  "E:\Apps\PostgreSQL\17-portable\bin"
}

$dataDir = if ($env:DELIVER_POSTGRES_DATA) {
  $env:DELIVER_POSTGRES_DATA
} else {
  "E:\Projects\.postgres-data\deliver"
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
$pgCtl = Join-Path $binDir "pg_ctl.exe"
$psql = Join-Path $binDir "psql.exe"
$portableLog = Join-Path $dataDir "server.log"

function Get-LocalPostgresService {
  return Get-Service -Name $serviceName -ErrorAction SilentlyContinue
}

function Assert-PortablePostgresConfigured {
  if (-not (Test-Path -LiteralPath $pgCtl)) {
    throw "pg_ctl.exe was not found at '$pgCtl'. Set DELIVER_POSTGRES_BIN to the PostgreSQL bin directory."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $dataDir "PG_VERSION"))) {
    throw "PostgreSQL data directory was not found at '$dataDir'. Set DELIVER_POSTGRES_DATA to the initialized cluster directory."
  }
}

function Get-PortablePostgresStatus {
  Assert-PortablePostgresConfigured
  & $pgCtl status -D $dataDir *> $null
  return $LASTEXITCODE -eq 0
}

function Start-PortablePostgres {
  Assert-PortablePostgresConfigured

  if (-not (Get-PortablePostgresStatus)) {
    Start-Process `
      -FilePath $pgCtl `
      -ArgumentList @("start", "-D", $dataDir, "-l", $portableLog) `
      -WindowStyle Hidden | Out-Null
  }
}

function Stop-PortablePostgres {
  Assert-PortablePostgresConfigured

  if (Get-PortablePostgresStatus) {
    & $pgCtl stop -D $dataDir -m fast -w -t 30 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Portable PostgreSQL did not stop cleanly."
    }
  }
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

  if ($service) {
    $service | Select-Object Name, Status, DisplayName | Format-Table -AutoSize
  } else {
    $portableRunning = Get-PortablePostgresStatus
    [PSCustomObject]@{
      Name = "portable-postgresql"
      Status = if ($portableRunning) { "Running" } else { "Stopped" }
      DataDirectory = $dataDir
      BinDirectory = $binDir
    } | Format-Table -AutoSize
  }

  [void](Test-LocalPostgresReady)
}

switch ($Action) {
  "start" {
    $service = Get-LocalPostgresService

    if ($service -and $service.Status -ne "Running") {
      Start-Service -Name $serviceName
    } elseif (-not $service) {
      Start-PortablePostgres
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
      throw "PostgreSQL did not become ready on ${hostName}:${port}."
    }

    Show-LocalPostgresStatus
  }
  "stop" {
    $service = Get-LocalPostgresService

    if ($service -and $service.Status -ne "Stopped") {
      Stop-Service -Name $serviceName
      Get-LocalPostgresService | Select-Object Name, Status, DisplayName | Format-Table -AutoSize
    } elseif (-not $service) {
      Stop-PortablePostgres
      Show-LocalPostgresStatus
    }
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
