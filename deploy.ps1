#Requires -Version 5.1
<#
.SYNOPSIS
    Sync code changes to the GCP VM and redeploy the api container.

.DESCRIPTION
    1. Upload apps/api/, docker-compose.prod.yml, Caddyfile, and deploy/ to VM
       (protects the server's .env.production — never overwritten).
    2. SSH into the VM and run deploy/deploy.sh which builds + restarts the api
       container and polls the health check endpoint.

.PARAMETER NoBuild
    Skip `docker compose build` — only restart the existing image.
    Use when you only changed a config value or want a quick restart.

.PARAMETER NoSync
    Skip the file-upload step and only run deploy/deploy.sh on the VM.
    Useful when you've already uploaded files or are restarting after a failure.

.EXAMPLE
    .\deploy.ps1                       # full sync + build + restart
    .\deploy.ps1 -NoBuild              # sync files, skip rebuild, just restart
    .\deploy.ps1 -NoSync               # rebuild + restart without re-uploading
    .\deploy.ps1 -NoSync -NoBuild      # restart container only (fastest)
#>
param(
    [switch]$NoBuild,
    [switch]$NoSync
)

$ErrorActionPreference = "Stop"

$PROJECT = "step-d"
$ZONE    = "asia-northeast3-a"
$VM      = "shorts-api"
$APP     = "/home/STEPAI05/app"

# gcloud args shared across all commands
$G = "--project=$PROJECT", "--zone=$ZONE"

function Invoke-SSH ([string]$Cmd) {
    gcloud compute ssh $VM @G --command=$Cmd
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE)" }
}

function Invoke-SCP ([string[]]$SrcArgs, [string]$Dest) {
    gcloud compute scp @G --compress @SrcArgs "${VM}:${Dest}"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed for: $SrcArgs" }
}

# ── 1. Sync ───────────────────────────────────────────────────────────────────
if (-not $NoSync) {
    Write-Host ""
    Write-Host "==> [1/2] Syncing source files to VM..." -ForegroundColor Cyan

    # apps/api/ — Python app, Dockerfile, requirements.txt
    # gcloud scp copies the named dir itself: "apps/api" → DEST/api/
    gcloud compute scp @G --compress --recurse "apps\api" "${VM}:${APP}/apps/"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: apps/api" }

    # Top-level compose and Caddy config
    gcloud compute scp @G --compress `
        "docker-compose.prod.yml" `
        "${VM}:${APP}/docker-compose.prod.yml"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: docker-compose.prod.yml" }

    if (Test-Path "Caddyfile") {
        gcloud compute scp @G --compress "Caddyfile" "${VM}:${APP}/Caddyfile"
        if ($LASTEXITCODE -ne 0) { throw "SCP failed: Caddyfile" }
    }

    # Deploy scripts (so deploy.sh itself is always up to date)
    gcloud compute scp @G --compress --recurse "deploy" "${VM}:${APP}/"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed: deploy/" }

    # Protect server secrets: remove any .env files that got synced
    Invoke-SSH @"
rm -f ${APP}/apps/api/.env ${APP}/apps/api/.env.local ${APP}/apps/api/.env.production
chmod +x ${APP}/deploy/deploy.sh
"@

    Write-Host "==> Files synced." -ForegroundColor Green
} else {
    Write-Host "==> Skipping sync (-NoSync)." -ForegroundColor Yellow
}

# ── 2. Deploy ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> [2/2] Deploying on VM..." -ForegroundColor Cyan

$deployArgs = if ($NoBuild) { "--no-build" } else { "" }
Invoke-SSH "${APP}/deploy/deploy.sh $deployArgs"

Write-Host ""
Write-Host "==> Deploy complete!" -ForegroundColor Green
