<#
.SYNOPSIS
    삼산 CTI 브릿지 자동 시작 등록.

.DESCRIPTION
    Windows 시작 프로그램 폴더(shell:startup)에 pythonw.exe + main.py 바로가기를 생성한다.
    실행 후 다음 로그인부터 백그라운드에서 자동 실행 — 콘솔 창 안 뜸.

.NOTES
    - 관리자 권한 불필요
    - 한 번만 실행하면 됨
    - 해제: shell:startup 폴더에서 바로가기 삭제
#>

$ErrorActionPreference = "Stop"

$BridgeDir = $PSScriptRoot
$Pythonw = Join-Path $BridgeDir "venv\Scripts\pythonw.exe"
$MainPy = Join-Path $BridgeDir "main.py"
$EnvFile = Join-Path $BridgeDir ".env"
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "삼산 전화 모니터링.lnk"

# 사전 검증
if (-not (Test-Path $Pythonw)) {
    Write-Host "[ERROR] venv가 없습니다: $Pythonw" -ForegroundColor Red
    Write-Host ""
    Write-Host "먼저 venv를 만들고 의존성을 설치하세요:" -ForegroundColor Yellow
    Write-Host "  python -m venv venv"
    Write-Host "  .\venv\Scripts\activate"
    Write-Host "  pip install -r requirements.txt"
    exit 1
}

if (-not (Test-Path $MainPy)) {
    Write-Host "[ERROR] main.py 없음: $MainPy" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "[WARNING] .env 파일이 없습니다." -ForegroundColor Yellow
    Write-Host "자동 시작은 등록되지만, .env가 없으면 실행 시 즉시 종료됩니다." -ForegroundColor Yellow
    Write-Host "  copy .env.example .env"
    Write-Host "  notepad .env"
    Write-Host ""
}

# 바로가기 생성 (이미 있으면 덮어씀)
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Pythonw
$Shortcut.Arguments = "main.py"
$Shortcut.WorkingDirectory = $BridgeDir
$Shortcut.WindowStyle = 7
$Shortcut.Description = "주유소 전화 수신 모니터링 (자동 실행)"
$Shortcut.Save()

Write-Host ""
Write-Host "[OK] 자동 시작 등록 완료" -ForegroundColor Green
Write-Host "  바로가기: $ShortcutPath"
Write-Host "  실행: $Pythonw main.py"
Write-Host "  작업 디렉토리: $BridgeDir"
Write-Host ""
Write-Host "다음 로그인부터 백그라운드에서 자동 실행됩니다." -ForegroundColor Cyan
Write-Host ""
Write-Host "지금 즉시 실행하려면 PC 재로그인 또는 다음 명령:" -ForegroundColor Gray
Write-Host "  Start-Process `"$Pythonw`" -ArgumentList `"main.py`" -WorkingDirectory `"$BridgeDir`" -WindowStyle Hidden"
Write-Host ""
Write-Host "확인 방법:" -ForegroundColor Gray
Write-Host "  작업 관리자 → 세부 정보 탭 → pythonw.exe 보이는지"
Write-Host "  로그 파일: $BridgeDir\logs\cti-bridge.log"
Write-Host ""
Write-Host "해제 방법:" -ForegroundColor Gray
Write-Host "  Win+R → shell:startup → '삼산 전화 모니터링' 바로가기 삭제"
