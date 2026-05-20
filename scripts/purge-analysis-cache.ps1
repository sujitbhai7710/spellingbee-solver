param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot '..\cloudflare.local.env'),
  [string]$Prefix = 'puzzle-analysis:'
)

$ErrorActionPreference = 'Stop'

function Read-EnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Config file not found: $Path"
  }

  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      continue
    }

    $parts = $line -split '=', 2
    if ($parts.Length -ne 2) {
      continue
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

$config = Read-EnvFile -Path $ConfigPath
foreach ($requiredKey in @('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_KV_NAMESPACE_ID')) {
  if (-not $config.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($config[$requiredKey])) {
    throw "Missing required key in config: $requiredKey"
  }
}

$env:CLOUDFLARE_API_TOKEN = $config['CLOUDFLARE_API_TOKEN']
$env:CLOUDFLARE_ACCOUNT_ID = $config['CLOUDFLARE_ACCOUNT_ID']
$workerDir = (Resolve-Path (Join-Path $PSScriptRoot '..\spellingbee-worker-updated-one')).Path

Push-Location $workerDir
try {
  $keysJson = npx wrangler kv key list --namespace-id $config['CLOUDFLARE_KV_NAMESPACE_ID'] --prefix $Prefix --remote
  $keys = @($keysJson | ConvertFrom-Json)

  if ($keys.Count -eq 0) {
    Write-Host "No KV keys found with prefix '$Prefix'."
    exit 0
  }

  foreach ($item in $keys) {
    Write-Host "Deleting KV key: $($item.name)"
    npx wrangler kv key delete $item.name --namespace-id $config['CLOUDFLARE_KV_NAMESPACE_ID'] --remote | Out-Null
  }
}
finally {
  Pop-Location
}

Write-Host "Deleted $($keys.Count) KV key(s) with prefix '$Prefix'."
