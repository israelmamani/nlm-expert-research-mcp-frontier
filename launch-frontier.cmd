@echo off
setlocal

where node.exe >nul 2>nul
if errorlevel 1 (
  >&2 echo NLM Expert Research MCP - Frontier requires Node.js 20 or newer on PATH.
  exit /b 1
)

node.exe "%~dp0dist\index.js"
exit /b %ERRORLEVEL%
