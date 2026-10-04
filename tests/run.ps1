# =========================================================
# run.ps1 · tests headless de Pixel Snake
#  1. sirve el proyecto con PHP embebido (XAMPP)
#  2. Chrome headless: --dump-dom + --virtual-time-budget
#     contra tests/unit.html (suite con shim de rAF)
#  3. capturas de pantalla vía CDP con emulación de
#     dispositivo (viewport real, sin recortes)
# =========================================================

param(
  [string]$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
  [string]$Php = 'C:\xampp\php\php.exe',
  [int]$Port = 8177,
  [int]$DebugPort = 9444
)

# Chrome escribe avisos por stderr: con EAP=Stop eso aborta el script,
# así que se usa Continue y se descarta el ruido de los procesos nativos.
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $PSScriptRoot '.tmp'
$shots = Join-Path $PSScriptRoot 'shots'
New-Item -ItemType Directory -Force -Path $tmp, $shots | Out-Null

if (-not (Test-Path $Chrome)) { throw "No se encontró Chrome: $Chrome" }
if (-not (Test-Path $Php)) { throw "No se encontró PHP: $Php" }

# ---------------------------------------------------------
#  Cliente CDP mínimo (WebSocket) para emular y capturar
# ---------------------------------------------------------
$script:cdpSeq = 0

function Connect-Cdp([string]$wsUrl) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = [System.Threading.CancellationToken]::None
  $ws.ConnectAsync([Uri]$wsUrl, $ct).Wait()
  [pscustomobject]@{ WS = $ws; CT = $ct }
}

function Send-Cdp($c, [string]$json) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $seg = New-Object 'ArraySegment[byte]' -ArgumentList @(, $bytes)
  $null = $c.WS.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $c.CT).Wait()
}

function Read-Cdp($c) {
  $ms = New-Object System.IO.MemoryStream
  do {
    $buf = New-Object byte[] 65536
    $seg = New-Object 'ArraySegment[byte]' -ArgumentList @(, $buf)
    $res = $c.WS.ReceiveAsync($seg, $c.CT).Result
    if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { return $null }
    $ms.Write($buf, 0, $res.Count)
  } until ($res.EndOfMessage)
  [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
}

function Invoke-Cdp($c, [string]$method, $params) {
  $script:cdpSeq++
  $id = $script:cdpSeq
  $msg = [ordered]@{ id = $id; method = $method }
  if ($params) { $msg['params'] = $params }
  $json = ($msg | ConvertTo-Json -Depth 8 -Compress)
  Send-Cdp $c $json
  while ($true) {
    $r = Read-Cdp $c
    if ($null -eq $r) { throw "CDP cerrado durante $method" }
    $obj = $r | ConvertFrom-Json
    if ($obj.id -eq $id) {
      if ($obj.error) { throw "CDP error en ${method}: $($obj.error.message)" }
      return $obj.result
    }
  }
}

# ---------------------------------------------------------
#  Ejecución
# ---------------------------------------------------------
$server = Start-Process -FilePath $Php -ArgumentList @('-S', "127.0.0.1:$Port", '-t', $root) -WindowStyle Hidden -PassThru
$chromeProc = $null
$exit = 1

try {
  $ready = $false
  for ($i = 0; $i -lt 50; $i++) {
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $ready) { throw "El servidor local no arrancó en el puerto $Port" }
  Write-Host "Servidor local listo: http://127.0.0.1:$Port" -ForegroundColor Green

  # ---------- 1. suite unitaria ----------
  Write-Host ''
  Write-Host '== Tests unitarios (Chrome --dump-dom --virtual-time-budget) ==' -ForegroundColor Cyan
  $profile = Join-Path $tmp ('profile-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $base = @(
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    "--user-data-dir=$profile",
    '--hide-scrollbars',
    '--force-device-scale-factor=1'
  )

  $domFile = Join-Path $tmp 'unit-dom.html'
  & $Chrome @base --virtual-time-budget=10000 --dump-dom "http://127.0.0.1:$Port/tests/unit.html" 2>$null |
    Out-File -FilePath $domFile -Encoding utf8

  $dom = Get-Content -Raw $domFile
  $lines = ($dom -split "`n") |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match '^(<pre[^>]*>)?(PASS|FAIL) ' -or $_ -match '^SUMMARY ' }

  foreach ($line in $lines) {
    if ($line -match '^FAIL') { Write-Host $line -ForegroundColor Red }
    elseif ($line -match '^SUMMARY') { Write-Host $line -ForegroundColor Cyan }
    else { Write-Host $line }
  }

  $summary = $lines | Where-Object { $_ -match '^SUMMARY ' } | Select-Object -First 1
  if (-not $summary) {
    Write-Host 'ERROR: no se encontró el resumen (¿falló la carga de módulos?)' -ForegroundColor Red
    $exit = 1
  } else {
    $passCount = [int]([regex]::Match($summary, 'pass=(\d+)').Groups[1].Value)
    $failCount = [int]([regex]::Match($summary, 'fail=(\d+)').Groups[1].Value)
    if ($failCount -eq 0 -and $passCount -ge 20) {
      Write-Host "OK: $passCount aserciones correctas" -ForegroundColor Green
      $exit = 0
    } else {
      Write-Host "FALLO: $failCount aserciones incorrectas (pass=$passCount)" -ForegroundColor Red
      $exit = 1
    }
  }

  # ---------- 2. capturas de pantalla (CDP + emulación) ----------
  Write-Host ''
  Write-Host '== Capturas de pantalla (viewport emulado) ==' -ForegroundColor Cyan

  $shotProfile = Join-Path $tmp ('shot-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $chromeProc = Start-Process -FilePath $Chrome -ArgumentList @(
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    "--user-data-dir=$shotProfile",
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    "--remote-debugging-port=$DebugPort",
    '--window-size=1280,800',
    'about:blank'
  ) -PassThru

  $cdpReady = $false
  for ($i = 0; $i -lt 50; $i++) {
    try {
      $null = Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/version" -TimeoutSec 2
      $cdpReady = $true
      break
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $cdpReady) { throw 'Chrome no abrió el puerto de depuración CDP' }

  $target = $null
  for ($i = 0; $i -lt 30 -and -not $target; $i++) {
    $target = (Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/list") |
      Where-Object { $_.type -eq 'page' } |
      Select-Object -First 1
    if (-not $target) { Start-Sleep -Milliseconds 200 }
  }
  if (-not $target) { throw 'No se encontró una pestaña de página en CDP' }

  $conn = Connect-Cdp $target.webSocketDebuggerUrl

  $targets = @(
    @{ File = 'menu-mobile.png'; W = 390; H = 844; Mobile = $true;  Url = "/index.html";     Wait = 3.5 },
    @{ File = 'menu-desktop.png'; W = 1280; H = 800; Mobile = $false; Url = "/index.html";    Wait = 3.5 },
    @{ File = 'play-mobile.png';  W = 390; H = 844; Mobile = $true;  Url = "/tests/play.html"; Wait = 1.5 },
    @{ File = 'play-desktop.png'; W = 1280; H = 800; Mobile = $false; Url = "/tests/play.html"; Wait = 1.5 }
  )

  foreach ($t in $targets) {
    $out = Join-Path $shots $t.File
    $null = Invoke-Cdp $conn 'Emulation.setDeviceMetricsOverride' @{
      width = $t.W
      height = $t.H
      deviceScaleFactor = 1
      mobile = [bool]$t.Mobile
    }
    $null = Invoke-Cdp $conn 'Page.navigate' @{ url = "http://127.0.0.1:$Port$($t.Url)" }
    Start-Sleep -Seconds $t.Wait
    $shot = Invoke-Cdp $conn 'Page.captureScreenshot' @{ format = 'png' }
    [System.IO.File]::WriteAllBytes($out, [Convert]::FromBase64String($shot.data))

    if ((Test-Path $out) -and (Get-Item $out).Length -gt 5000) {
      Write-Host ("OK  {0}  ({1}x{2}, {3} KB)" -f $t.File, $t.W, $t.H, [int]((Get-Item $out).Length / 1kb)) -ForegroundColor Green
    } else {
      Write-Host "FALLO captura: $($t.File)" -ForegroundColor Red
      $exit = 1
    }
  }
} finally {
  if ($chromeProc -and -not $chromeProc.HasExited) {
    Stop-Process -Id $chromeProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
if ($exit -eq 0) { Write-Host 'RESULTADO: TODO CORRECTO' -ForegroundColor Green }
else { Write-Host 'RESULTADO: HAY FALLOS' -ForegroundColor Red }
exit $exit
