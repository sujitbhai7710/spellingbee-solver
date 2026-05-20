param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot '..\cloudflare.local.env')
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

function Normalize-GitHubRepoUrl {
  param([string]$Value)

  $trimmed = if ($null -eq $Value) { '' } else { [string]$Value }
  $trimmed = $trimmed.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $null
  }

  $trimmed = ($trimmed -replace '\.git$','').TrimEnd('/')

  if ($trimmed -match '^[^/\s]+/[^/\s]+$') {
    return "https://github.com/$trimmed"
  }

  if ($trimmed -match '^https://github\.com/[^/\s]+/[^/\s]+$') {
    return $trimmed
  }

  throw "GITHUB_REPO_URL must be either 'owner/repo' or 'https://github.com/owner/repo'. Received: $Value"
}

$config = Read-EnvFile -Path $ConfigPath
$controlKeys = @(
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_WORKER_NAME',
  'CLOUDFLARE_KV_NAMESPACE_ID'
)

foreach ($requiredKey in @('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_WORKER_NAME')) {
  if (-not $config.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($config[$requiredKey])) {
    throw "Missing required key in config: $requiredKey"
  }
}

if ($config.ContainsKey('GITHUB_REPO_URL')) {
  $config['GITHUB_REPO_URL'] = Normalize-GitHubRepoUrl -Value $config['GITHUB_REPO_URL']
}

$workerDir = (Resolve-Path (Join-Path $PSScriptRoot '..\spellingbee-worker-updated-one')).Path
$env:CLOUDFLARE_API_TOKEN = $config['CLOUDFLARE_API_TOKEN']
$env:CLOUDFLARE_ACCOUNT_ID = $config['CLOUDFLARE_ACCOUNT_ID']

$secretKeys = $config.Keys | Where-Object {
  $controlKeys -notcontains $_ -and -not [string]::IsNullOrWhiteSpace($config[$_])
} | Sort-Object

if ($secretKeys.Count -eq 0) {
  Write-Host 'No worker secrets found in the config file.'
  exit 0
}

Push-Location $workerDir
try {
  foreach ($secretKey in $secretKeys) {
    Write-Host "Uploading worker secret: $secretKey"
    $config[$secretKey] | npx wrangler secret put $secretKey --name $config['CLOUDFLARE_WORKER_NAME']
  }
}
finally {
  Pop-Location
}

Write-Host "Uploaded $($secretKeys.Count) worker secret(s)."
