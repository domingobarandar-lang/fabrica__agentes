<#
.SYNOPSIS
  Distribuye el núcleo conversacional compartido a un proyecto de cliente, con
  contabilidad: versión, verificación por hash e inventario.

.DESCRIPTION
  Resuelve P6 del diseño: "núcleo compartido" solo existe si hay un mecanismo
  para que llegue a cada proyecto Y para saber quién quedó atrasado. Antes de
  esto, el adapter de LLM se copiaba a mano y nadie sabía qué cliente tenía
  qué versión.

  POR QUÉ COPIA Y NO ES UN PAQUETE: npm privado (GitHub Packages) exigiría un
  PAT con read:packages en cada repo de cliente y en Railway — credencial nueva,
  o sea gate rojo del semáforo. Un submódulo git obligaría a cada repo de
  cliente a tener acceso al repo privado de la fábrica para poder deployar.
  Esto es copia CON CONTABILIDAD, que da la propiedad que importa hoy sin tocar
  ningún gate. Disparador documentado para migrar a npm privado: el 4º cliente.

  VERIFICA POR DEFECTO. Solo escribe con -Aplicar. Nunca toca el producto del
  cliente (prompts, tools, schema, .env, config, bitácora).

.PARAMETER Proyecto
  Ruta ABSOLUTA a la carpeta del agente dentro del proyecto del cliente
  (la que contiene agent/, whatsapp/, index.js). Acepta proyectos dentro y
  fuera del repo de la fábrica.

.PARAMETER Aplicar
  Escribe. Sin este switch solo informa y no toca nada.

.PARAMETER Forzar
  Sobreescribe archivos con cambios locales. Deja respaldo con marca de tiempo
  antes de pisar nada. Sin esto, una divergencia local aborta la sincronización.

.PARAMETER Semilla
  Copia también la capa `ejemplo/` (prompts, tools, supabase en memoria, index,
  bot). Es lo que hace que un proyecto NUEVO arranque y responda. En un proyecto
  ya personalizado NO se usa: pisaría el producto del cliente.

.PARAMETER Todos
  Recorre la raíz de clientes y reporta el estado de cada proyecto. Es el
  inventario: sin esto no se puede saber quién quedó atrasado.

.PARAMETER RaizClientes
  Carpeta madre de los proyectos, para -Todos.

.EXAMPLE
  .\scripts\sincronizar-nucleo.ps1 -Proyecto C:\clientes\petshop-lira\bot\agente
  Verifica sin escribir. Es el modo por defecto.

.EXAMPLE
  .\scripts\sincronizar-nucleo.ps1 -Proyecto C:\clientes\petshop-lira\bot\agente -Aplicar

.EXAMPLE
  .\scripts\sincronizar-nucleo.ps1 -Todos -RaizClientes C:\clientes
  Inventario: qué proyecto está al día, atrasado o con cambios locales.
#>

[CmdletBinding()]
param(
    [string]$Proyecto,
    [switch]$Aplicar,
    [switch]$Forzar,
    [switch]$Semilla,
    [switch]$Todos,
    [string]$RaizClientes
)

$ErrorActionPreference = 'Stop'

$RaizRepo   = Split-Path -Parent $PSScriptRoot
$RaizBase   = Join-Path $RaizRepo 'lineas\conversacional\plantillas\base-agente'
$Manifiesto = Join-Path $RaizBase 'MANIFIESTO.json'
$ArchivoVersion = Join-Path $RaizBase 'VERSION'

if (-not (Test-Path -LiteralPath $Manifiesto)) {
    Write-Host "ERROR: no encuentro el manifiesto en $Manifiesto" -ForegroundColor Red
    exit 1
}

$man     = Get-Content -LiteralPath $Manifiesto -Raw -Encoding UTF8 | ConvertFrom-Json
$version = (Get-Content -LiteralPath $ArchivoVersion -Raw -Encoding UTF8).Trim()

# GUARDA nunca_tocar. El manifiesto la prometía en sus notas desde el día uno,
# pero no estaba implementada: era una propiedad de seguridad documentada y
# ausente. Importa de verdad desde que evals/escenarios.js —la suite de pruebas
# del cliente, escrita a mano— está en la lista: si alguien la moviera al núcleo
# "para compartirla", un -Aplicar borraría las pruebas de todos los clientes sin
# avisar. Se verifica antes de tocar nada, en cada corrida.
#
# Una entrada terminada en '/' protege la CARPETA completa. Hace falta desde que
# existe 'conocimiento/': sus archivos los nombra el cliente (formas-de-pago.md,
# planes.md, lo que sea), así que la fábrica no puede listarlos de antemano y una
# lista de nombres exactos no protegería nada.
function Test-Protegido {
    param([string]$Destino)
    foreach ($patron in $man.nunca_tocar) {
        if ($patron -eq $Destino) { return $true }
        if ($patron.EndsWith('/') -and $Destino.StartsWith($patron, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

$colision = @($man.nucleo | Where-Object { Test-Protegido -Destino $_.destino })
if ($colision.Count -gt 0) {
    Write-Host "ERROR en MANIFIESTO.json: hay archivos del núcleo que pisarían producto del cliente." -ForegroundColor Red
    foreach ($c in $colision) {
        Write-Host "  - '$($c.destino)' está en 'nucleo' y también en 'nunca_tocar'" -ForegroundColor Red
    }
    Write-Host "  Sácalo de una de las dos listas antes de sincronizar." -ForegroundColor Red
    exit 1
}

function Get-Hash256 {
    param([string]$Ruta)
    if (-not (Test-Path -LiteralPath $Ruta)) { return $null }
    return (Get-FileHash -LiteralPath $Ruta -Algorithm SHA256).Hash
}

# Lee los hashes que se estamparon en el proyecto la última vez que se
# sincronizó. Sirve SOLO para distinguir "atrasado" de "editado a mano";
# nunca para decidir si está al día — eso se recalcula siempre sobre disco.
function Read-Estampado {
    param([string]$DirProyecto)
    $ruta = Join-Path $DirProyecto 'NUCLEO.md'
    $mapa = @{}
    if (-not (Test-Path -LiteralPath $ruta)) { return $mapa }
    foreach ($linea in (Get-Content -LiteralPath $ruta -Encoding UTF8)) {
        if ($linea -match '^\|\s*`([^`]+)`\s*\|\s*([0-9A-Fa-f]{64})\s*\|') {
            $mapa[$Matches[1]] = $Matches[2].ToUpper()
        }
    }
    return $mapa
}

function Get-EstadoProyecto {
    param([string]$DirProyecto)

    $estampado = Read-Estampado -DirProyecto $DirProyecto
    $filas = @()

    foreach ($item in $man.nucleo) {
        $origen  = Join-Path $RaizBase $item.origen
        $destino = Join-Path $DirProyecto $item.destino

        $hOrigen  = Get-Hash256 -Ruta $origen
        $hDestino = Get-Hash256 -Ruta $destino

        if ($null -eq $hDestino) {
            $estado = 'FALTANTE'
        } elseif ($hDestino -eq $hOrigen) {
            $estado = 'AL_DIA'
        } elseif ($estampado.ContainsKey($item.destino) -and $estampado[$item.destino] -eq $hDestino) {
            # Coincide con lo que dejamos la última vez: nadie lo tocó, solo
            # quedó atrás respecto del núcleo actual.
            $estado = 'ATRASADO'
        } else {
            # No coincide ni con el núcleo ni con lo estampado: alguien editó.
            $estado = 'DIVERGIDO'
        }

        $filas += [pscustomobject]@{
            Archivo = $item.destino
            Estado  = $estado
            Origen  = $origen
            Destino = $destino
            Hash    = $hOrigen
        }
    }
    return $filas
}

function Write-Estampado {
    param([string]$DirProyecto, $Filas)

    $lineas = @()
    $lineas += "# Núcleo conversacional instalado"
    $lineas += ""
    $lineas += "**Versión:** $version"
    $lineas += "**Sincronizado:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $lineas += "**Origen:** ``lineas/conversacional/plantillas/base-agente/nucleo/`` del repo de la fábrica"
    $lineas += ""
    $lineas += "Este archivo lo genera ``scripts/sincronizar-nucleo.ps1``. **No editarlo a mano.**"
    $lineas += "Es informativo: la verificación siempre recalcula los hashes sobre disco."
    $lineas += "Sirve para distinguir *atrasado* (quedó atrás, nadie lo tocó) de"
    $lineas += "*divergido* (alguien lo editó en este proyecto)."
    $lineas += ""
    $lineas += "No toques estos archivos a mano: un arreglo local se pierde en la próxima"
    $lineas += "sincronización. Si el núcleo necesita un cambio, se hace en el repo de la"
    $lineas += "fábrica y se re-sincroniza a todos."
    $lineas += ""
    $lineas += "| Archivo | SHA256 |"
    $lineas += "|---|---|"
    foreach ($f in $Filas) {
        $lineas += "| ``$($f.Archivo)`` | $($f.Hash) |"
    }
    $lineas += ""

    $ruta = Join-Path $DirProyecto 'NUCLEO.md'
    # -Encoding utf8 explícito: Set-Content en PS 5.1 escribe ANSI por defecto
    # y rompe los acentos.
    $lineas | Out-File -LiteralPath $ruta -Encoding utf8
}

function Show-Estado {
    param($Filas, [string]$Etiqueta)

    $colores = @{ AL_DIA = 'Green'; ATRASADO = 'Yellow'; DIVERGIDO = 'Red'; FALTANTE = 'DarkYellow' }
    Write-Host ""
    Write-Host $Etiqueta -ForegroundColor Cyan
    foreach ($f in $Filas) {
        $c = $colores[$f.Estado]
        if (-not $c) { $c = 'Gray' }
        Write-Host ("  {0,-10} {1}" -f $f.Estado, $f.Archivo) -ForegroundColor $c
    }
}

function Sync-Proyecto {
    param([string]$DirProyecto)

    if (-not (Test-Path -LiteralPath $DirProyecto)) {
        Write-Host "ERROR: la carpeta '$DirProyecto' no existe." -ForegroundColor Red
        return 1
    }

    $filas = Get-EstadoProyecto -DirProyecto $DirProyecto
    Show-Estado -Filas $filas -Etiqueta "Núcleo v$version -> $DirProyecto"

    $divergidos = @($filas | Where-Object { $_.Estado -eq 'DIVERGIDO' })
    $pendientes = @($filas | Where-Object { $_.Estado -ne 'AL_DIA' })

    if ($pendientes.Count -eq 0) {
        Write-Host "`n  Al día. Nada que hacer." -ForegroundColor Green
        return 0
    }

    if (-not $Aplicar) {
        Write-Host "`n  $($pendientes.Count) archivo(s) pendiente(s). Modo verificación: no se escribió nada." -ForegroundColor Yellow
        Write-Host "  Para aplicar: agrega -Aplicar" -ForegroundColor Yellow
        return 0
    }

    if ($divergidos.Count -gt 0 -and -not $Forzar) {
        Write-Host "`n  ABORTADO: $($divergidos.Count) archivo(s) del núcleo fueron editados en este proyecto." -ForegroundColor Red
        foreach ($d in $divergidos) { Write-Host "    - $($d.Archivo)" -ForegroundColor Red }
        Write-Host "  Pisarlos borraría ese trabajo. Revisa si el cambio debe subir al núcleo." -ForegroundColor Red
        Write-Host "  Para sobreescribir igual (deja respaldo): agrega -Forzar" -ForegroundColor Red
        return 2
    }

    if ($divergidos.Count -gt 0) {
        $sello   = Get-Date -Format 'yyyyMMdd-HHmmss'
        $respaldo = Join-Path $DirProyecto ".respaldo-nucleo-$sello"
        Write-Host "`n  Respaldando $($divergidos.Count) archivo(s) divergente(s) en $respaldo" -ForegroundColor Yellow
        foreach ($d in $divergidos) {
            $destinoResp = Join-Path $respaldo $d.Archivo
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destinoResp) | Out-Null
            Copy-Item -LiteralPath $d.Destino -Destination $destinoResp -Force
        }
    }

    $capas = @($man.nucleo)
    if ($Semilla) { $capas += @($man.ejemplo) }

    foreach ($item in $capas) {
        $origen  = Join-Path $RaizBase $item.origen
        $destino = Join-Path $DirProyecto $item.destino
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destino) | Out-Null
        # -Force también para que los archivos ocultos (.gitignore) viajen.
        Copy-Item -LiteralPath $origen -Destination $destino -Force
    }

    $filasFinales = Get-EstadoProyecto -DirProyecto $DirProyecto
    Write-Estampado -DirProyecto $DirProyecto -Filas $filasFinales

    Write-Host "`n  Sincronizado. Núcleo v$version, $($capas.Count) archivo(s). Estampado en NUCLEO.md" -ForegroundColor Green
    Write-Host "  Recuerda: corre la suite mock del proyecto antes de dar por bueno el cambio." -ForegroundColor Gray
    return 0
}

# ─── Entrada ──────────────────────────────────────────────────────────────────

if ($Todos) {
    if (-not $RaizClientes) {
        Write-Host "ERROR: -Todos necesita -RaizClientes con la carpeta madre de los proyectos." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path -LiteralPath $RaizClientes)) {
        Write-Host "ERROR: la raíz '$RaizClientes' no existe." -ForegroundColor Red
        exit 1
    }

    Write-Host "Inventario del núcleo v$version bajo $RaizClientes" -ForegroundColor Cyan

    # Un proyecto es cualquier carpeta que tenga agent/core.js
    $candidatos = Get-ChildItem -LiteralPath $RaizClientes -Recurse -Filter 'core.js' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -like '*\agent' -and $_.FullName -notlike '*\node_modules\*' }

    if (-not $candidatos) {
        Write-Host "  (no encontré ningún proyecto con agent/core.js)" -ForegroundColor Yellow
        exit 0
    }

    $resumen = @()
    foreach ($c in $candidatos) {
        $dirAgente = Split-Path -Parent (Split-Path -Parent $c.FullName)
        $filas = Get-EstadoProyecto -DirProyecto $dirAgente
        $resumen += [pscustomobject]@{
            Proyecto  = $dirAgente
            AlDia     = @($filas | Where-Object { $_.Estado -eq 'AL_DIA' }).Count
            Atrasados = @($filas | Where-Object { $_.Estado -eq 'ATRASADO' }).Count
            Divergido = @($filas | Where-Object { $_.Estado -eq 'DIVERGIDO' }).Count
            Faltantes = @($filas | Where-Object { $_.Estado -eq 'FALTANTE' }).Count
        }
    }
    $resumen | Format-Table -AutoSize
    exit 0
}

if (-not $Proyecto) {
    Write-Host "Uso: .\scripts\sincronizar-nucleo.ps1 -Proyecto <ruta absoluta a .../agente> [-Aplicar] [-Forzar] [-Semilla]" -ForegroundColor Yellow
    Write-Host "     .\scripts\sincronizar-nucleo.ps1 -Todos -RaizClientes <carpeta madre>" -ForegroundColor Yellow
    exit 1
}

exit (Sync-Proyecto -DirProyecto $Proyecto)
