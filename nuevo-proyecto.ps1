<#
.SYNOPSIS
  Crea de forma segura la carpeta de un proyecto de cliente FUERA del repo de la fábrica.

.DESCRIPTION
  Regla dura de la constitución: ningún proyecto de cliente nace dentro de
  fabrica__agentes/. Este guión instancia la carpeta externa por cliente, con su
  propio git y su .gitignore puesto ANTES del primer `git add`, para que una key del
  pool copiada al proyecto nunca quede versionada.

  Comportamiento:
    - Crea la carpeta madre de clientes si no existe.
    - Si el CLIENTE es nuevo: crea su carpeta, corre `git init`, escribe `.gitignore`
      (con .env y node_modules) y un `CLIENTE.md` inicial.
    - Si el CLIENTE ya existe: reusa su carpeta y su git (no re-inicializa).
    - Si el PROYECTO ya existe: FALLA y no sobrescribe nada (regla dura).
    - Imprime la ruta absoluta del proyecto (RUTA_PROYECTO) para que el orquestador
      se la pase a cada subagente.

  Quién lo corre: el orquestador (vía la herramienta PowerShell) o José a mano.
  Si PowerShell bloquea el script por ExecutionPolicy, invocar así:
    powershell -ExecutionPolicy Bypass -File .\nuevo-proyecto.ps1 -Cliente ... -Proyecto ... -Linea ...

.PARAMETER Cliente
  Slug corto del cliente (ej. taller-lucas). Una carpeta por cliente, con git propio.

.PARAMETER Proyecto
  Slug corto del proyecto (ej. orden-trabajo, bot-agenda). Un cliente puede tener varios.

.PARAMETER Linea
  Línea de producción: conversacional | automatizacion | a-medida.

.PARAMETER RaizClientes
  Carpeta madre donde viven todos los clientes. Por defecto C:\Users\Adela\clientes.
  Ponerla dentro de una carpeta respaldada (ej. OneDrive) para que el trabajo entregado
  quede respaldado — regla 5 de la constitución.

.EXAMPLE
  .\nuevo-proyecto.ps1 -Cliente taller-lucas -Proyecto orden-trabajo -Linea automatizacion

.EXAMPLE
  .\nuevo-proyecto.ps1 -Cliente dental-sanmartin -Proyecto bot-agenda -Linea conversacional -RaizClientes "C:\Users\Adela\OneDrive\clientes"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Cliente,
    [Parameter(Mandatory = $true)][string]$Proyecto,
    [Parameter(Mandatory = $true)]
    [ValidateSet('conversacional', 'automatizacion', 'a-medida')]
    [string]$Linea,
    [string]$RaizClientes = 'C:\Users\Adela\clientes'
)

$ErrorActionPreference = 'Stop'

function Fallar($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

# 1) git tiene que estar en el PATH, o no dejamos nada a medio crear.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fallar "git no está disponible en el PATH. Instala git o abre una terminal que lo tenga. No se creó ninguna carpeta."
}

# 2) Carpeta madre de clientes: se crea si no existe (nunca en silencio).
if (-not (Test-Path -LiteralPath $RaizClientes)) {
    Write-Host "La carpeta madre '$RaizClientes' no existe. La creo." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $RaizClientes | Out-Null
}

$clienteDir  = Join-Path $RaizClientes $Cliente
$proyectoDir = Join-Path $clienteDir  $Proyecto

# 3) Fail-closed: si el proyecto ya existe, NO se sobrescribe (regla dura).
#    Test-Path explícito porque New-Item -Force pisaría en silencio.
if (Test-Path -LiteralPath $proyectoDir) {
    Fallar "el proyecto ya existe en '$proyectoDir'. No se sobrescribe. Elige otro slug o borra a mano si de verdad quieres rehacerlo."
}

# 4) Cliente nuevo: carpeta + git + .gitignore ANTES de cualquier add + CLIENTE.md.
$clienteEsNuevo = -not (Test-Path -LiteralPath $clienteDir)
if ($clienteEsNuevo) {
    New-Item -ItemType Directory -Path $clienteDir | Out-Null

    # git init primero, .gitignore inmediatamente después: así el primer `git add`
    # que haga cualquiera (orquestador incluido) ya respeta el ignore.
    Push-Location $clienteDir
    try {
        git init --quiet | Out-Null
    } finally {
        Pop-Location
    }

    $gitignore = @'
# Secretos — nunca a git, nunca a Notion
.env
.env.*
!.env.example
secrets/

# Dependencias
node_modules/
'@
    Set-Content -Path (Join-Path $clienteDir '.gitignore') -Value $gitignore -Encoding utf8

    $clienteMd = @"
# Cliente: $Cliente

**Creado**: $(Get-Date -Format 'yyyy-MM-dd')

## Quién es
<rubro, nombre del negocio, contacto>

## Qué contrató
- $Proyecto ($Linea)

## Credenciales asignadas
<solo NOMBRES del pool, nunca valores. Ej: "bot Telegram: token #3 del pool">

## Contactos
<nombre, teléfono, cómo prefiere que le escriban>
"@
    Set-Content -Path (Join-Path $clienteDir 'CLIENTE.md') -Value $clienteMd -Encoding utf8

    # Bitácora del cliente (protocolo anti-amnesia) + hook de aviso, copiados de la fábrica.
    $tplBitacora = Join-Path $PSScriptRoot 'clientes\_plantilla\BITACORA.md'
    if (Test-Path -LiteralPath $tplBitacora) {
        (Get-Content -Raw $tplBitacora) -replace '<nombre del proyecto>', $Cliente |
            Set-Content -Path (Join-Path $clienteDir 'BITACORA.md') -Encoding utf8
    }
    New-Item -ItemType Directory -Path (Join-Path $clienteDir '.claude') | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $clienteDir 'scripts') | Out-Null
    $tplCheck = Join-Path $PSScriptRoot 'scripts\check-bitacora.ps1'
    if (Test-Path -LiteralPath $tplCheck) {
        Copy-Item -LiteralPath $tplCheck -Destination (Join-Path $clienteDir 'scripts\check-bitacora.ps1')
    }
    $settings = @'
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-bitacora.ps1" }
        ]
      }
    ]
  }
}
'@
    Set-Content -Path (Join-Path $clienteDir '.claude\settings.json') -Value $settings -Encoding utf8

    Write-Host "Cliente nuevo creado: $clienteDir (git init + .gitignore + CLIENTE.md + BITACORA.md + hook anti-amnesia)" -ForegroundColor Green
}
else {
    Write-Host "Cliente existente: $clienteDir (reuso su carpeta y su git)" -ForegroundColor Green
    # Si por lo que sea el cliente existe sin .gitignore, lo ponemos igual (seguro).
    $giPath = Join-Path $clienteDir '.gitignore'
    if (-not (Test-Path -LiteralPath $giPath)) {
        Set-Content -Path $giPath -Value ".env`n.env.*`n!.env.example`nsecrets/`nnode_modules/`n" -Encoding utf8
        Write-Host "  (le faltaba .gitignore, se lo agregué)" -ForegroundColor Yellow
    }
}

# 5) Carpeta del proyecto + esqueleto mínimo (el pipeline llena el resto).
New-Item -ItemType Directory -Path $proyectoDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $proyectoDir 'entrega') | Out-Null

# 6) Ruta para el orquestador. Última línea, fácil de capturar.
Write-Host ""
Write-Host "Proyecto listo. Línea: $Linea" -ForegroundColor Green
Write-Host "RUTA_PROYECTO=$proyectoDir"
