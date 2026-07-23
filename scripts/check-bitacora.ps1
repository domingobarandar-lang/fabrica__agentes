<#
.SYNOPSIS
  Recordatorio del protocolo anti-amnesia. MODO AVISO — nunca bloquea, siempre sale 0.

.DESCRIPTION
  Al cierre de una sesión, si en el árbol de trabajo hay cambios a archivos de
  COMPORTAMIENTO sin una entrada nueva en el registro correspondiente, imprime un
  recordatorio. Auto-detecta el modo:
    - Proyecto de cliente (hay BITACORA.md en la raíz) → comportamiento = agente/*,
      prompts.js, tools.js, SPEC.md, schema.sql; registro = BITACORA.md.
    - Fábrica (hay docs/DECISIONES.md) → comportamiento = CLAUDE.md, docs/*.md,
      .claude/*, lineas/*; registro = docs/DECISIONES.md.

  Está envuelto en try/catch y termina SIEMPRE en exit 0: por diseño no puede
  interrumpir ni romper una sesión de Claude Code. Solo avisa.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot
)

try {
    if (-not $RepoRoot) {
        $RepoRoot = (git rev-parse --show-toplevel 2>$null)
    }
    if (-not $RepoRoot -or -not (Test-Path -LiteralPath $RepoRoot)) { exit 0 }

    Push-Location $RepoRoot
    try {
        $porcelain = git status --porcelain 2>$null
    } finally {
        Pop-Location
    }
    if (-not $porcelain) { exit 0 }

    # Nombres de archivo cambiados (quita el código de estado XY de las 2 primeras columnas).
    $changed = @($porcelain | ForEach-Object { ($_ -replace '^..\s+', '').Trim() } | Where-Object { $_ })
    if (-not $changed) { exit 0 }

    $esCliente = Test-Path -LiteralPath (Join-Path $RepoRoot 'BITACORA.md')
    if ($esCliente) {
        $behaviorRegex = 'prompts\.js|tools\.js|SPEC\.md|schema\.sql|(^|/)agent/|(^|/)agente/'
        $logFile = 'BITACORA.md'
    }
    else {
        $behaviorRegex = '(^|/)CLAUDE\.md|(^|/)docs/.*\.md|(^|/)\.claude/|(^|/)lineas/'
        $logFile = 'docs/DECISIONES.md'
    }

    $logEscaped = [regex]::Escape($logFile)
    $behaviorChanged = @($changed | Where-Object { $_ -match $behaviorRegex -and $_ -notmatch $logEscaped })
    $logChanged = @($changed | Where-Object { $_ -match $logEscaped })

    if ($behaviorChanged.Count -gt 0 -and $logChanged.Count -eq 0) {
        Write-Host ""
        Write-Host "  [ANTI-AMNESIA] Tocaste archivos de comportamiento sin registrar el cambio." -ForegroundColor Yellow
        Write-Host "  Archivos: $($behaviorChanged -join ', ')" -ForegroundColor Yellow
        Write-Host "  Antes de cerrar, anota una entrada en $logFile con su nivel de semaforo (ver CLAUDE.md)." -ForegroundColor Yellow
        Write-Host ""
    }
}
catch {
    # Modo aviso: cualquier error se traga en silencio. Nunca bloquea la sesión.
}

exit 0
