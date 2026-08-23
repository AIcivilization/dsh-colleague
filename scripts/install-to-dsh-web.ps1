# ============================================================
# dsh-colleague one-click install to DSH web profile (Windows)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install-to-dsh-web.ps1
#
# What it does:
#   1. Build dist/
#   2. Install to web profile via dsh plugin --profile web add file://
#   3. Restart dsh web
#   4. Verify plugin is mounted
# ============================================================

$ErrorActionPreference = "Stop"

# ---- Helpers ----
function Write-Info  { param([string]$msg) Write-Host "[colleague] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "[colleague] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "[colleague] $msg" -ForegroundColor Red }

# ---- Locate plugin root ----
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PLUGIN_DIR = Split-Path -Parent $SCRIPT_DIR
Write-Info "Plugin directory: $PLUGIN_DIR"

# ---- Check dsh command ----
$DSH_BIN = $null

# Try: dsh in PATH
$dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
if ($dshCmd) {
    $DSH_BIN = "dsh"
} else {
    # Try: npx @deepseek-ai/dsh
    $npxDsh = Get-Command npx -ErrorAction SilentlyContinue
    if ($npxDsh) {
        $DSH_BIN = "npx @deepseek-ai/dsh"
    }
}

if (-not $DSH_BIN) {
    # Try: common global install paths
    $npmGlobal = "$env:APPDATA\npm"
    if (Test-Path "$npmGlobal\dsh.cmd") {
        $DSH_BIN = "$npmGlobal\dsh.cmd"
    } elseif (Test-Path "$npmGlobal\node_modules\@deepseek-ai\dsh\lib\bin.js") {
        $DSH_BIN = "node `"$npmGlobal\node_modules\@deepseek-ai\dsh\lib\bin.js`""
    }
}

if (-not $DSH_BIN) {
    Write-Err "dsh command not found. Please install DeepSeek Harness first."
    Write-Err "  npm install -g @deepseek-ai/dsh"
    exit 1
}
Write-Info "DSH command: $DSH_BIN"

# ---- 1. Build ----
Write-Info "Step 1/4: Building plugin..."
Set-Location $PLUGIN_DIR
$buildArgs = $DSH_BIN -split ' '
# Use npx tsdown for build
$buildResult = & npx tsdown 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed"
    Write-Err $buildResult
    exit 1
}
Write-Info "Build complete"

# ---- 2. Install to DSH web profile ----
Write-Info "Step 2/4: Installing to web profile..."

# Remove old version if already installed
$removeArgs = @("plugin", "--profile", "web", "remove", "dsh-colleague")
& Invoke-Expression "$DSH_BIN $($removeArgs -join ' ')" 2>$null

# Install
$installUri = "file:///$($PLUGIN_DIR -replace '\\','/')"
$installCmd = "$DSH_BIN plugin --profile web add `"$installUri`""
Write-Info "Running: $installCmd"
$installResult = Invoke-Expression "$installCmd 2>&1" | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
    Write-Err "Installation failed"
    exit 1
}
Write-Info "Installation complete"

# ---- 3. Restart DSH web ----
Write-Info "Step 3/4: Restarting DSH web..."

# Stop existing instance on port 3080
$portPid = (Get-NetTCPConnection -LocalPort 3080 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($portPid) {
    Write-Warn "Port 3080 is in use, stopping PID $portPid..."
    Stop-Process -Id $portPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Start new instance
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\web"
if (Test-Path $profileDir) {
    Set-Location $profileDir
}

$logFile = Join-Path $env:TEMP "dsh-web.log"
$startCmd = "Start-Process -WindowStyle Hidden -FilePath cmd -ArgumentList '/c $DSH_BIN web > `"$logFile`" 2>&1'"
Invoke-Expression $startCmd
Write-Info "DSH web started (log: $logFile)"

# Wait for startup
Write-Info "Waiting for DSH to start..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3080/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Info "DSH web is ready"
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Warn "DSH web startup timed out, check $logFile"
}

# ---- 4. Verify ----
Write-Info "Step 4/4: Verifying plugin..."
Start-Sleep -Seconds 2

# Check plugin-console state
try {
    $stateResp = Invoke-WebRequest -Uri "http://127.0.0.1:3080/plugin-console/state" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $stateJson = $stateResp.Content | ConvertFrom-Json
    $entries = $stateJson.entries | Where-Object { $_.entryId -match 'dsh-colleague|colleague' }
    if ($entries) {
        $e = $entries[0]
        Write-Info "Plugin verified: status=$($e.fiberPhase), enabled=$($e.enabled)"
    } else {
        Write-Warn "Plugin not found in plugin-console state, check DSH logs: $logFile"
    }
} catch {
    Write-Warn "Cannot reach plugin-console state"
}

# Verify API route
try {
    $apiResp = Invoke-WebRequest -Uri "http://127.0.0.1:3080/plugins/dsh-colleague/state" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $apiJson = $apiResp.Content | ConvertFrom-Json
    $memberCount = $apiJson.members.Count
    Write-Info "API route OK (members=$memberCount)"
} catch {
    Write-Warn "API route not ready (webServer may not have registered yet)"
}

Write-Host ""
Write-Info "========================================"
Write-Info "  Installation complete!"
Write-Info "========================================"
Write-Host ""
Write-Host "  DSH Web:  http://127.0.0.1:3080"
Write-Host "  Settings -> Plugins -> Plugin Management -> you should see dsh-colleague"
Write-Host "  Settings -> Plugins -> Plugin Config -> you should see the Team Panel card"
Write-Host ""
