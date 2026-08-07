<#
.SYNOPSIS
  Valida el agente.config.json de uno o de todos los proyectos de cliente.

.DESCRIPTION
  Envoltorio de fábrica sobre `scripts/validar-config.js`, que vive DENTRO de
  cada proyecto (viaja en el núcleo).

  POR QUÉ EL ENVOLTORIO NO REIMPLEMENTA LA VALIDACIÓN: el esquema del contrato
  está definido una sola vez, en `config.js` del núcleo. Escribirlo de nuevo acá
  habría creado dos definiciones que se desincronizan el día que alguien agrega
  un campo con prisa — y la que se queda vieja es siempre la que no corre en
  cada `npm test`. Este script resuelve rutas, recorre proyectos y resume; la
  verdad sobre qué es una config válida la dice el núcleo.

  Sale con código 1 si algún proyecto tiene errores.

.PARAMETER Proyecto
  Ruta ABSOLUTA a la carpeta del agente (la que contiene agent/, config.js).

.PARAMETER Todos
  Recorre la raíz de clientes y valida cada proyecto que encuentre.

.PARAMETER RaizClientes
  Carpeta madre de los proyectos, para -Todos.

.EXAMPLE
  .\scripts\validar-config.ps1 -Proyecto C:\clientes\petshop-lira\bot-catalogo\agente

.EXAMPLE
  .\scripts\validar-config.ps1 -Todos -RaizClientes C:\clientes
#>

[CmdletBinding()]
param(
    [string]$Proyecto,
    [switch]$Todos,
    [string]$RaizClientes
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: node no está en el PATH. El validador es JS porque el esquema vive en el núcleo." -ForegroundColor Red
    exit 1
}

function Test-Proyecto {
    param([string]$Dir)

    $validador = Join-Path $Dir 'scripts\validar-config.js'
    if (-not (Test-Path -LiteralPath $validador)) {
        Write-Host "  SIN VALIDADOR  $Dir" -ForegroundColor DarkYellow
        Write-Host "    (núcleo anterior a 1.3.0: corre sincronizar-nucleo.ps1 -Aplicar)" -ForegroundColor DarkGray
        return 2
    }

    Push-Location $Dir
    try {
        # stderr ya viene capturado; redirigirlo en PS 5.1 envuelve cada línea en
        # un ErrorRecord y ensucia la salida de un comando que terminó bien.
        node 'scripts/validar-config.js'
        return $LASTEXITCODE
    } finally {
        Pop-Location
    }
}

if ($Todos) {
    if (-not $RaizClientes) {
        Write-Host "ERROR: -Todos necesita -RaizClientes con la carpeta madre de los proyectos." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path -LiteralPath $RaizClientes)) {
        Write-Host "ERROR: la raíz '$RaizClientes' no existe." -ForegroundColor Red
        exit 1
    }

    # Mismo criterio que sincronizar-nucleo.ps1: un proyecto es una carpeta con
    # agent/core.js. Así los dos scripts ven exactamente el mismo universo.
    $candidatos = Get-ChildItem -LiteralPath $RaizClientes -Recurse -Filter 'core.js' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -like '*\agent' -and $_.FullName -notlike '*\node_modules\*' }

    if (-not $candidatos) {
        Write-Host "  (no encontré ningún proyecto con agent/core.js bajo $RaizClientes)" -ForegroundColor Yellow
        exit 0
    }

    $conErrores = 0
    foreach ($c in $candidatos) {
        $dirAgente = Split-Path -Parent (Split-Path -Parent $c.FullName)
        Write-Host ""
        Write-Host "═══ $dirAgente" -ForegroundColor Cyan
        $codigo = Test-Proyecto -Dir $dirAgente
        if ($codigo -eq 1) { $conErrores++ }
    }

    Write-Host ""
    if ($conErrores -gt 0) {
        Write-Host "$conErrores proyecto(s) con errores de configuración." -ForegroundColor Red
        exit 1
    }
    Write-Host "Todos los proyectos tienen su configuración válida." -ForegroundColor Green
    exit 0
}

if (-not $Proyecto) {
    Write-Host "Uso: .\scripts\validar-config.ps1 -Proyecto <ruta absoluta a .../agente>" -ForegroundColor Yellow
    Write-Host "     .\scripts\validar-config.ps1 -Todos -RaizClientes <carpeta madre>" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path -LiteralPath $Proyecto)) {
    Write-Host "ERROR: la carpeta '$Proyecto' no existe." -ForegroundColor Red
    exit 1
}

exit (Test-Proyecto -Dir $Proyecto)
