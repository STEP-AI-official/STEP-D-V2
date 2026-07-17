#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy latest main to the STEP-D worker VM (stepd-worker) and restart it.

.DESCRIPTION
    The worker runs the TS source from /opt/stepd (tsx), so a deploy is just:
    fetch origin → hard-reset to origin/main → restart the systemd service.

    Uses `git reset --hard` (not `pull`) on purpose: it discards any local drift on
    the VM (e.g. a file hot-copied via scp) and makes the tree exactly match main —
    so the deploy is idempotent and never blocks on "local changes would be overwritten".

    Auth: the VM's git remote already carries a read-only token in its URL, so fetch
    works non-interactively. (Rotate that token periodically; see runbook.)

.PARAMETER DeploySaAccount
    이 계정으로 gcloud 를 실행한다 (gcloud --account). stepd-deployer 같은 배포 SA 를 넣으면
    hkj 재인증 프롬프트 없이 비대화형으로 통과. 미지정 시 env:DEPLOY_SA_ACCOUNT → 활성 계정 순.

.EXAMPLE
    .\deploy-worker.ps1
    $env:DEPLOY_SA_ACCOUNT = "stepd-deployer@step-d.iam.gserviceaccount.com"; .\deploy-worker.ps1
#>
param(
    [switch]$SkipRestart,
    # 배포 SA (gcloud --account). 미지정 시 env:DEPLOY_SA_ACCOUNT → 활성 계정 순.
    [string]$DeploySaAccount = $env:DEPLOY_SA_ACCOUNT
)

$ErrorActionPreference = "Stop"

$PROJECT = "step-d"
$ZONE    = "us-central1-a"
$VM      = "stepd-worker"
$APP     = "/opt/stepd"

# ── 비대화형 네이티브 실행 래퍼 ────────────────────────────────────────────────
# PowerShell 5.1 은 gcloud 가 정상 진행상황을 stderr 로 내는 것만으로도 EAP='Stop' 에서
# NativeCommandError 로 조기 종료할 수 있다. 이 래퍼는 그 구간에서만 EAP 를 풀고 성공/실패를
# 오직 $LASTEXITCODE 로만 판정한다. 배포 SA 가 있으면 --account 로 비대화형 고정.
$script:DeployAccount = $DeploySaAccount

function Invoke-Gcloud {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GcloudArgs)
    if ($script:DeployAccount) { $GcloudArgs = @($GcloudArgs) + "--account=$script:DeployAccount" }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & gcloud @GcloudArgs 2>&1 | ForEach-Object { Write-Host $_ }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    return $LASTEXITCODE
}

$restart = if ($SkipRestart) {
    "echo 'skip restart'"
} else {
    "sudo systemctl daemon-reload && sudo systemctl restart stepd-worker && sleep 3 && systemctl is-active stepd-worker"
}

# Single remote command: update code, (re)start, and confirm the shorts wiring is present.
$remote = "cd $APP && sudo git fetch origin && sudo git reset --hard origin/main && $restart && echo '--- 배선 확인 ---' && grep -c writeRecommendationsFromShorts apps/server/src/content-pipeline.ts"

Write-Host ""
Write-Host "==> Deploying latest main to worker VM '$VM' ($ZONE)..." -ForegroundColor Cyan
Write-Host "    배포 계정: $(if ($script:DeployAccount) { "$script:DeployAccount (--account, 비대화형)" } else { 'gcloud 활성 계정 (기본)' })"
Write-Host ""

$sshCode = Invoke-Gcloud compute ssh $VM --zone=$ZONE --project=$PROJECT --command=$remote
if ($sshCode -ne 0) { throw "worker deploy failed (exit $sshCode)" }

Write-Host ""
Write-Host "==> Worker deploy complete. (기대: 'active' 그리고 '1' 이상)" -ForegroundColor Green
