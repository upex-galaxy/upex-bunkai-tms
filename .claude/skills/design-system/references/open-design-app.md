# Path C — Open Design app (local Docker UI)

> Opt-in path. User-driven visual iteration in a local web UI, then bridge to Path E for the final `DESIGN.md`.

## Purpose

Use este camino cuando el user quiere **iterar visualmente** antes de fijar los tokens — explorar variantes de paleta, jugar con composiciones, ver previews HTML/PDF/PPTX en vivo, todo en una UI local. Open Design (nexu-io, Apache-2.0) es OSS, free, sin signup, sin SaaS lock-in. Comparte el catálogo de 72 brands con `getdesign` (Path B), pero le suma una capa interactiva de Q&A visual encima. La UI no emite `DESIGN.md` nativo — produce artifacts HTML/PDF/PPTX/ZIP/PNG/MP4 que después se convierten al spec Google Labs vía Path E.

## Pre-flight

Verify Docker is installed before printing setup steps:

```bash
docker --version
```

Si el comando falla, abortar early con hint de instalación:

- macOS: `brew install --cask docker` (Docker Desktop).
- Linux: `apt-get install docker.io docker-compose-plugin` (o el equivalente de la distro).
- Windows: Docker Desktop desde docker.com.

Why: no tiene sentido clonar el repo y seguir si Docker no está; failearemos en `docker compose up` con un error confuso. Mejor un mensaje claro upfront.

## Setup

Clone the repo into `/tmp` (evita ensuciar el proyecto del user) y arrancá la stack:

```bash
git clone https://github.com/nexu-io/open-design /tmp/open-design
cd /tmp/open-design/deploy
docker compose up -d
```

Default port: `7456`. Abrí en el browser:

```
http://localhost:7456
```

Optional env vars (export antes de `docker compose up` si hay conflicto o querés pin de versión):

- `OPEN_DESIGN_PORT=7456` — overridealo si 7456 ya está ocupado (e.g. `OPEN_DESIGN_PORT=7800`).
- `OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/open-design:<tag>` — pin a una versión específica si la stack inestable te muerde. Default es `latest`.

## User iteration (in the browser UI)

Una vez que `localhost:7456` carga, guiá al user por estos pasos en la UI:

1. **Create new project** → la app pregunta un nombre y crea un workspace local.
2. **Pick a skill** del catálogo bundleado (31 skills): `web-prototype`, `dashboard`, `saas-landing`, `mobile-app`, `deck` modes, etc. Esto le dice al motor qué tipo de output querés.
3. **Pick a design system** del catálogo de 72 brands (mismo catálogo que `getdesign`, importado de VoltAgent/awesome-design-md). El user puede previsualizar paletas antes de comprometerse.
4. **Provide brief**: el user pega contexto del producto — industria, tone, target persona, competitor references. Si hay PRD del proyecto, sugerile copiar el executive summary acá.
5. **Iterate**: la UI usa el coding-agent CLI local (Claude Code, Cursor, Codex, Gemini, OpenCode, Qwen, Copilot, Hermes, Kimi — auto-detecta 16) como motor BYOK. Si no detecta CLI local, el user puede meter un Anthropic / OpenAI / Azure / Google API key en Settings → BYOK y la UI lo proxea vía `POST /api/proxy/{provider}/stream`.

Decile explícito al user: "Itera todo lo que quieras en la UI. Cuando estés conforme con la dirección visual, volvé acá y avisame." No mires por arriba del hombro — el valor de este path es justamente la exploración libre.

## Output collection

Open Design escribe artifacts en disco a medida que el user genera:

```
./.od/artifacts/<timestamp>-<slug>/
  index.html         # principal — preview completo
  *.pdf              # opcional, si el user pidió export
  *.pptx             # opcional, deck mode
  *.zip              # bundle empaquetado
  *.png              # screenshots de estados
```

Per-project SQLite metadata en `./.od/app.sqlite`.

**Estos NO son `DESIGN.md`**. Open Design no emite el formato Google Labs — emite HTML/PDF/PPTX/ZIP. Por eso este path tiene una etapa de conversión obligatoria.

## Bridge step to Path E

Una vez que el user confirma que está conforme:

1. **Capturá los inputs visibles en la UI**: el design-system slug que el user eligió en step 3 (visible en project settings de Open Design), y cualquier custom token que el user haya tweakeado durante la iteración.
2. **Listá los artifacts**: enumerá los paths bajo `./.od/artifacts/<timestamp>-<slug>/` que el user considera "final" (puede haber varias iteraciones — preguntá cuál es la canónica).
3. **Delegate a `references/llm-authored.md`** con este input adicional concatenado al briefing estándar:

   > "User iterated in Open Design with design-system `<slug>` and produced these artifacts: `<paths>`. Use the design-system base as a starting point, refine with the visual decisions evident in the HTML (extract tokens from `index.html` inline styles or `<style>` blocks)."

4. Path E (LLM-authored) corre con esos inputs como contexto extra y produce el `DESIGN.md` final en el root del proyecto siguiendo el spec de Google Labs.

Why bridge a Path E en vez de transformar directo: el spec de Google Labs (YAML frontmatter + 8 secciones prescritas + lint validation con `@google/design.md`) es estricto. La conversión es un acto de síntesis (decidir qué del HTML va al frontmatter vs al prose, qué tokens prevalecen cuando hay conflicto entre el design system base y los tweaks del user), no un parse mecánico. Path E ya tiene toda esa lógica documentada — no la dupliques acá.

## Cleanup

Después de que Path E confirma `DESIGN.md` generado y `lint` exit 0:

```bash
cd /tmp/open-design/deploy
docker compose down
```

Preguntale al user si querés conservar el volume (`docker compose down -v` lo borra) — si planea re-iterar en otra sesión, dejá el volume; si fue one-shot, limpiá.

## Troubleshooting

| Síntoma                                                        | Causa probable                                                | Fix                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` falla con `port already allocated`         | 7456 ocupado por otro servicio                                | `export OPEN_DESIGN_PORT=7800 && docker compose up -d`, abrir `localhost:7800`                                        |
| UI dice "No coding agent detected"                             | Open Design no encontró Claude Code / Cursor / etc. en PATH   | Settings → BYOK → meter Anthropic API key, o instalar el CLI faltante y reload                                        |
| `./.od/artifacts/` está vacío después de la iteración          | Open Design no completó el render (timeout o agent CLI murió) | Re-correr el brief desde la UI; revisar logs en `docker compose logs -f`                                              |
| El artifact final no representa lo que el user vio en pantalla | Cache de browser stale                                        | Hard reload (Cmd+Shift+R / Ctrl+Shift+R), re-exportar                                                                 |
| Path E genera un `DESIGN.md` que no se parece a lo iterado     | El bridge no pasó los artifacts correctamente                 | Verificar que la delegación a Path E incluya los paths exactos de los HTML y el slug; re-correr con inputs explícitos |
