# Path D — Claude Design handoff

> Opt-in premium path. User-driven visual iteration in Anthropic's `claude.ai/design`, then bundle ingest + bridge to Path E for the final `DESIGN.md`.

## Purpose

Use este camino cuando el user tiene **Claude Pro / Max / Team / Enterprise** y quiere la mejor calidad visual disponible — Claude Design (Anthropic Labs, research preview launched 2026-04-17, powered by Opus 4.7) es UI-only en `claude.ai/design`, two-pane chat+canvas, lee el codebase / design files del user durante el onboarding y arma un design system que todos los proyectos posteriores heredan automáticamente. No hay CLI, API ni MCP oficial — la invocación es 100% manual en el browser. La skill no puede triggerearla programáticamente; lo único que puede hacer es esperar al user, ingestar el bundle exportado y convertirlo al spec Google Labs vía Path E.

## Prerequisites

- **Claude plan**: Pro, Max, Team, o Enterprise. No hay tier free. Si el user no tiene, redirigilo a Path B (default) o C (Open Design free).
- **Enterprise users**: el admin de la org debe activar Claude Design en Organization Settings (default OFF). Si no está habilitado, el user verá un mensaje "Contact your administrator" — no hay workaround.
- **Browser actualizado** (cualquier moderno) — la UI usa funcionalidades modernas de canvas.

Why no automatizamos esto: Anthropic no expone API/CLI/MCP para Claude Design. Hay un community MCP+CLI en `github.com/pro-vi/designer` pero el autor warnea que los rate limits son tight incluso en Max — no es production-grade. La acción humana manual es by-design del producto, no un gap nuestro.

## User flow

La skill imprime estos pasos textuales para que el user los ejecute en el browser. **No los corre por él** — son human-driven:

1. Abrí `https://claude.ai/design` en el browser (logged in con tu cuenta Pro+).
2. Iterá en el canvas (chat pane + design pane). Si querés que Claude Design lea tu codebase para extraer la design system actual, conectá el repo via la opción de onboarding — es el killer feature del producto.
3. Cuando estés conforme con el diseño, click **Export** (top-right de la canvas) y elegí UNA de:
   - **Send to local coding agent** — empuja un bundle directo a tu Claude Code local (terminal-side). El bundle aterriza en el repo donde Claude Code está corriendo.
   - **Save as folder** — descarga el bundle como ZIP / folder local. Guardalo en `design/handoff/<slug>.zip` (o `design/handoff/<slug>/` si es folder unzipped). Convención path: `design/handoff/` en el root del proyecto.
4. Volvé a la sesión de la skill y confirmá que terminaste.

Why el path convencional `design/handoff/`: estandariza dónde la skill busca el bundle, hace el flow reproducible entre proyectos, y deja un lugar obvio gitignoreable si el user no quiere commitear el bundle crudo (sí commitea el `DESIGN.md` final).

## Wait state

Una vez impresas las instrucciones, la skill **bloquea** esperando al user con AskUserQuestion:

> ¿Ya exportaste el bundle de Claude Design a `design/handoff/`?
>
> - **yes** — ya está, procedé al ingest.
> - **not yet** — sigo en el browser, esperá.
> - **abort** — cancelar este path y volver al menú de selección.

Si "not yet" → re-print las instrucciones cortas y vuelve a esperar. No timeout — el user puede tardar lo que tarde.
Si "abort" → cleanup y volver a `SKILL.md` path selection.

## Bundle ingest

Cuando el user confirma "yes", la skill lee el bundle. Estructura esperada (per Anthropic Labs docs + community writeups):

```
design/handoff/<slug>/
  index.html              # design renderizado
  *.css                   # estilos extraídos
  *.js                    # scripts opcionales
  components/             # machine-readable component spec
  tokens.json             # design tokens canónicos
  screenshots/            # state snapshots
  assets/                 # imágenes, fonts referenciadas
  README.md               # target stack + conventions del coding agent
```

(Si el user eligió "Send to local coding agent" en vez de "Save as folder", Claude Code ya tiene los files en el repo — la skill busca igual en `design/handoff/` por convención. Si Claude Code los puso en otro lado, preguntale al user el path.)

**Files load-bearing**:

- `tokens.json` — los design tokens canónicos. Esto es lo que prevalece.
- `README.md` — primeros ~500 chars dan contexto sobre la dirección visual y el target stack.

Why ingestamos `tokens.json` y NO el HTML: el HTML es implementation-leaning (lleva markup, classnames, layout decisions que son del componente, no del design system). Los tokens son las decisiones de diseño canónicas — colors, typography scales, spacing scales, radius, shadows. Esos son los que entran al frontmatter de `DESIGN.md`. El prose del DESIGN.md captura la rationale (tomada del README + screenshots context).

## Bridge step to Path E

Con `tokens.json` parseado y los primeros ~500 chars del README extraídos:

1. **Delegate a `references/llm-authored.md`** con este input adicional concatenado al briefing estándar:

   > "User exported a Claude Design bundle at `design/handoff/<slug>/`.
   > Tokens (inline): `<paste del tokens.json completo>`.
   > README excerpt: `<primeros 500 chars del README.md>`.
   > Use these as the foundation; preserve token values exactly where possible (colors, typography, spacing, radius). Document the visual rationale in prose using the README excerpt + screenshots descriptions if disponibles."

2. Path E (LLM-authored) consume esos inputs y produce el `DESIGN.md` final en el root del proyecto siguiendo el spec de Google Labs.

Why bridge a Path E en vez de transform directo: el bundle de Claude Design usa su propio formato (no Google Labs spec). La conversión necesita decidir qué tokens van al frontmatter YAML, qué prose va a cada una de las 8 secciones prescritas, y validar WCAG. Path E ya tiene todo eso documentado — no lo dupliques acá.

## Cost note

Claude Design consume los rate limits del plan del user (Pro / Max / Team / Enterprise). La skill **NO** invoca Claude Design programáticamente — no hay forma. La acción humana manual es required by design del producto. No hay costo monetario adicional para el user más allá de su suscripción Claude — el bridge a Path E corre en la sesión de Claude Code local (Claude Code Max plan o API key del user) y es independiente.

## Troubleshooting

| Síntoma                                                                        | Causa probable                                                                            | Fix                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/handoff/<slug>/` no existe después de export                           | El user eligió otro path en "Save as folder"                                              | Preguntar al user el path real, ajustar y re-ingest                                                                                                                           |
| `tokens.json` no está en el bundle                                             | Claude Design cambió el schema del export                                                 | Surface el error claramente; fallback: re-correr Path E **from scratch** ignorando el bundle, usando solo Constitution+PRD como input                                         |
| `README.md` tiene implementation hints que conflictúan con el spec Google Labs | Claude Design escribe el README pensando en Claude Code, no en DESIGN.md                  | Preserve los token values del `tokens.json` (canónicos), ignorá el prose de implementación del README, usá solo la parte "visual rationale" como input al prose del DESIGN.md |
| Export falla en `claude.ai/design` con "Contact administrator"                 | Org Enterprise con Claude Design deshabilitado                                            | No hay workaround técnico — el user debe pedirle al admin que active el feature en Organization Settings, o caer a Path B/C/E                                                 |
| Bundle pesa mucho (>50MB) por screenshots/assets                               | Normal — Claude Design exporta state snapshots completos                                  | OK, no problem; la skill solo lee `tokens.json` + `README.md`, ignora el resto                                                                                                |
| Re-export necesario porque el user cambió de opinión                           | El user puede re-iterar en `claude.ai/design` y re-exportar a `design/handoff/<slug-v2>/` | La skill detecta múltiples slugs en `design/handoff/` y pregunta cuál es el canónico antes del ingest                                                                         |
