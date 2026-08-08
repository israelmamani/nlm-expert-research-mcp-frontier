$ErrorActionPreference = 'Stop'
npm run build
$staging = Join-Path (Get-Location) 'release\mcpb-staging'
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item package.json, package-lock.json, README.md -Destination $staging -ErrorAction SilentlyContinue
Copy-Item -LiteralPath 'dist' -Destination $staging -Recurse
Copy-Item -LiteralPath 'manifest.mcpb.json' -Destination $staging
npm install --omit=dev --prefix $staging --ignore-scripts
$out = Join-Path (Get-Location) 'release\NLM-Expert-Research-MCP-Frontier-0.1.0.mcpb'
$zip = Join-Path (Get-Location) 'release\NLM-Expert-Research-MCP-Frontier-0.1.0.zip'
if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
tar.exe -a -c -f $zip -C $staging .
Move-Item -LiteralPath $zip -Destination $out
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
Set-Content -LiteralPath ($out + '.sha256') -Value "$hash  NLM-Expert-Research-MCP-Frontier-0.1.0.mcpb"
Write-Output $out
