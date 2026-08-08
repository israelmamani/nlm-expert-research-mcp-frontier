$ErrorActionPreference = 'Stop'
$package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
npm.cmd run build
$staging = Join-Path (Get-Location) 'release\mcpb-staging'
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item package.json, package-lock.json, README.md, INSTALL.md, CLAUDE_DESKTOP.md, AUTH.md, SECURITY.md, PRIVACY.md, ARCHITECTURE.md, OPERATIONS.md, TROUBLESHOOTING.md, RELEASE_NOTES.md, LICENSE, THIRD_PARTY_NOTICES.md -Destination $staging
Copy-Item -LiteralPath 'dist' -Destination $staging -Recurse
Copy-Item -LiteralPath 'manifest.json' -Destination $staging
New-Item -ItemType Directory -Path (Join-Path $staging 'scripts') -Force | Out-Null
Copy-Item -LiteralPath 'scripts\patch-upstream.mjs' -Destination (Join-Path $staging 'scripts')
Copy-Item -LiteralPath 'scripts\upstream-compatibility.json' -Destination (Join-Path $staging 'scripts')
npm.cmd ci --omit=dev --prefix $staging
$artifactName = "NLM-Expert-Research-MCP-Frontier-$($package.version).mcpb"
$out = Join-Path (Get-Location) (Join-Path 'release' $artifactName)
if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }
npx.cmd -y @anthropic-ai/mcpb@2.1.2 validate (Join-Path $staging 'manifest.json')
npx.cmd -y @anthropic-ai/mcpb@2.1.2 pack $staging $out
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
Set-Content -LiteralPath ($out + '.sha256') -Value "$hash  $artifactName"
Write-Output $out
