﻿# =====================================================================
#  sync-gs.ps1
#  Code.gs 의 내용을 index.html 안의 백업 코드(scriptCodeTemplateFallback)
#  에 자동으로 복사합니다.
#
#  실행 방법:
#    1) PowerShell 열기
#    2) cd "<이 폴더 경로>"
#    3) .\sync-gs.ps1
#
#  실행 정책으로 막히면:
#    PowerShell -ExecutionPolicy Bypass -File .\sync-gs.ps1
# =====================================================================

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$gsPath   = Join-Path $root 'Code.gs'
$htmlPath = Join-Path $root 'index.html'

if (-not (Test-Path $gsPath))   { throw "Code.gs not found: $gsPath" }
if (-not (Test-Path $htmlPath)) { throw "index.html not found: $htmlPath" }

# UTF-8 (BOM 없음) 으로 읽기
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$gs   = [System.IO.File]::ReadAllText($gsPath,   $utf8NoBom)
$html = [System.IO.File]::ReadAllText($htmlPath, $utf8NoBom)

# JS 템플릿 리터럴용 이스케이프 (순서 중요: 백슬래시 -> 백틱 -> ${)
$bt = [string][char]0x60   # `
$escaped = $gs.Replace('\', '\\').Replace($bt, '\' + $bt).Replace('${', '\${')

$beginMarker = '// <SYNC-CODE-GS:BEGIN>'
$endMarker   = '// <SYNC-CODE-GS:END>'

$beginIdx = $html.IndexOf($beginMarker)
if ($beginIdx -lt 0) { throw "BEGIN marker not found in index.html" }

$beginLineEnd = $html.IndexOf("`n", $beginIdx)
if ($beginLineEnd -lt 0) { throw "newline after BEGIN marker not found" }
$beginLineEnd += 1

$endIdx = $html.IndexOf($endMarker, $beginLineEnd)
if ($endIdx -lt 0) { throw "END marker not found in index.html" }

$endLineStart = $html.LastIndexOf("`n", $endIdx) + 1

# 새 블록:  return `<Code.gs 내용>`;
# END 마커 줄의 들여쓰기는 $after 가 이미 가지고 있으므로 여기서 덧붙이지 않음
$newBlock = "  return " + $bt + $escaped + $bt + ";`r`n"

$before = $html.Substring(0, $beginLineEnd)
$after  = $html.Substring($endLineStart)
$result = $before + $newBlock + $after

if ($result -eq $html) {
  Write-Host "No change - index.html is already in sync with Code.gs." -ForegroundColor Green
  return
}

# UTF-8 (BOM 없음) 으로 저장
[System.IO.File]::WriteAllText($htmlPath, $result, $utf8NoBom)

$gsLineCount = ($gs -split "`n").Count
Write-Host ("Sync OK. Code.gs ({0} lines) -> index.html" -f $gsLineCount) -ForegroundColor Green