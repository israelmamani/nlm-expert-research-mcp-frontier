$ErrorActionPreference = 'Stop'
$selfId = $PID
$profile = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) '.data\upstream\chrome_profile'))
$processes = Get-CimInstance Win32_Process
$frontierNode = @($processes | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*@roomi-fields*notebooklm-mcp*dist*index.js*' })
$frontierChrome = @($processes | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like "*$profile*" })
$frontierWatchers = @($processes | Where-Object {
  if ($_.ProcessId -eq $selfId -or $_.Name -ne 'powershell.exe' -or $_.CommandLine -notmatch '(?i)-EncodedCommand\s+([A-Za-z0-9+/=]+)') { return $false }
  try {
    $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))
    return $decoded -like '*FrontierWindow*' -and $decoded -like "*$profile*"
  } catch { return $false }
})
[pscustomobject]@{event='frontier.clean_shutdown';upstream_node=$frontierNode.Count;profile_chrome=$frontierChrome.Count;hide_watchers=$frontierWatchers.Count} | ConvertTo-Json -Compress
if ($frontierNode.Count -ne 0 -or $frontierChrome.Count -ne 0 -or $frontierWatchers.Count -ne 0) { exit 1 }
