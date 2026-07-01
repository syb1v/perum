# Deploy perum-core (Control Plane) to production server
# Usage:
#   .\deploy-core.ps1
#   .\deploy-core.ps1 -SkipGitPull
#   .\deploy-core.ps1 -NoPrune
#
# Requires SSH key: C:\Users\halil\.ssh\id_rsa

param(
    [string]$Hostname = "171.22.73.2",
    [string]$Username = "leonid",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$DeployPath = "/opt/perum",
    [int]$Port = 22,
    [switch]$SkipGitPull,
    [switch]$NoPrune,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "=== PERUM Core Deploy ===" -ForegroundColor Cyan
Write-Host "  Target : ${Username}@${Hostname}:${Port}" -ForegroundColor Gray
Write-Host "  Path   : ${DeployPath}" -ForegroundColor Gray

if (-not (Test-Path -LiteralPath $KeyPath)) {
    Write-Error "SSH key not found: $KeyPath"
    exit 1
}

$sshBase = "ssh", "-i", $KeyPath, "-p", $Port, "-o", "StrictHostKeyChecking=accept-new", "${Username}@${Hostname}"

function Invoke-Ssh {
    param([string]$Command)
    if ($WhatIf) {
        Write-Host "[DRY RUN] ${Command}" -ForegroundColor Yellow
        return
    }
    Write-Host "  => ${Command}" -ForegroundColor DarkGray
    & $sshBase $Command
    if ($LASTEXITCODE -ne 0) {
        throw "SSH command failed (exit=$LASTEXITCODE): $Command"
    }
}

try {
    # 1. Verify server is reachable
    Write-Host "`n[1/5] Проверка соединения с сервером..." -ForegroundColor Green
    Invoke-Ssh "echo connected && uname -a"

    # 2. Git pull latest code
    if (-not $SkipGitPull) {
        Write-Host "`n[2/5] git pull (актуализация compose-файлов и миграций)..." -ForegroundColor Green
        Invoke-Ssh "cd ${DeployPath} && git pull --ff-only"
    } else {
        Write-Host "`n[2/5] git pull — ПРОПУЩЕН" -ForegroundColor Yellow
    }

    # 3. Pull latest core image from GHCR
    Write-Host "`n[3/5] docker compose pull perum_core..." -ForegroundColor Green
    Invoke-Ssh "cd ${DeployPath} && docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod pull perum_core"

    # 4. Recreate perum_core container (core auto-migrates on startup via alembic)
    Write-Host "`n[4/5] docker compose up -d perum_core..." -ForegroundColor Green
    Invoke-Ssh "cd ${DeployPath} && docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --force-recreate perum_core"

    # 5. Cleanup unused images
    if (-not $NoPrune) {
        Write-Host "`n[5/5] docker image prune -f..." -ForegroundColor Green
        Invoke-Ssh "docker image prune -f"
    } else {
        Write-Host "`n[5/5] docker image prune — ПРОПУЩЕН" -ForegroundColor Yellow
    }

    Write-Host "`n=== Деплой perum-core завершён успешно ===" -ForegroundColor Cyan
    Write-Host "Здоровье: https://admin.grsn-panel.ru/health" -ForegroundColor Gray

} catch {
    Write-Host "`n=== ОШИБКА ДЕПЛОЯ ===" -ForegroundColor Red
    Write-Error $_.Exception.Message
    exit 1
}
