@echo off
SET PATH=C:\Users\RVR\Documents\GraphQL\node;%PATH%
cd /d %~dp0

echo.
echo  iWlz Bemiddelingsregister - Portable GraphQL + OPA
echo  ====================================================
echo.

REM ── Check opa.exe is present ──────────────────────────────────────────────────
IF NOT EXIST opa.exe (
  echo  ERROR: opa.exe not found in project folder.
  echo  Download from: https://github.com/open-policy-agent/opa/releases/latest
  echo  Get: opa_windows_amd64.exe  and rename to opa.exe
  echo.
  pause
  exit /b 1
)

REM ── Start OPA as background process ──────────────────────────────────────────
echo  Starting OPA policy engine on port 8181...
start "OPA Policy Engine" /min cmd /c "opa.exe run --server --addr :8181 ./policies 2>&1"

REM ── Wait for OPA to be ready ─────────────────────────────────────────────────
echo  Waiting for OPA to be ready...
timeout /t 2 /nobreak >nul

REM ── Generate tokens on first run ─────────────────────────────────────────────
IF NOT EXIST policies\tokens\admin.jwt (
  echo  Generating test JWT tokens...
  node generate-tokens.js
)

REM ── Start GraphQL server ──────────────────────────────────────────────────────
echo  Starting GraphQL server on port 4000...
echo.
node server_bemiddeling_opa.js

pause
