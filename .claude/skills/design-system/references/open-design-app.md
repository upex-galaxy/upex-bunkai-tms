# Path C — Open Design app (local desktop UI)

> Opt-in path. User-driven visual iteration in a local app, then bridge to Path E for the final `DESIGN.md`.

## Purpose

Use este camino cuando el user quiere **iterar visualmente** antes de fijar los tokens: explorar variantes de paleta, jugar con composiciones, ver previews HTML/PDF/PPTX en vivo, todo local. Open Design (nexu-io, Apache-2.0) es OSS, free, sin signup, sin SaaS lock-in. Comparte el catálogo de brands con `getdesign` (Path B), pero le suma una capa interactiva de Q&A visual encima. La UI no emite `DESIGN.md` nativo: produce artifacts HTML/PDF/PPTX/ZIP/Markdown que después se convierten al spec Google Labs vía Path E.

> **Verificado contra `open-design-v0.16.1`** (release 2026-07-23), instalado en macOS arm64.
> El producto evoluciona rápido y el README del repo suele ir por delante del release publicado
> (ver "README drift" abajo). Ante discrepancia, el binario real manda y este doc se actualiza.
> Para screen mockups (fase screen-mapping), el user pega el `BRIEF.md` generado por
> `references/screen-design-brief.md` en el formulario Discover / brief field.

## Install: tres vías, elegí una

El surface principal a 0.16.1 es una **desktop app Electron con daemon local-first**. Docker sigue existiendo pero ya no es el camino recomendado, y **no** hace falta para este path.

| Vía                     | Requisitos                     | Cuándo                                                        |
| ----------------------- | ------------------------------ | ------------------------------------------------------------- |
| **Desktop app** ⭐      | ninguno (binario firmado)      | Default. Sin Docker, sin conflicto de versión de Node.         |
| Docker Compose          | Docker Desktop / docker-ce     | Solo si el user ya vive en containers o quiere acceso remoto.  |
| From source             | Node `~24.x` + pnpm `10.33.x`  | Solo para hackear el código de Open Design.                    |

### Vía 1: desktop app (recomendada)

Assets del release (GitHub Releases o `open-design.ai`): `mac-arm64.dmg` (~279 MB), `mac-x64.dmg` (~289 MB), `win-x64-setup.exe` (~301 MB). A 0.16.1 **no** hay AppImage de Linux publicado aunque el README lo liste como opcional.

Descargar, verificar el hash publicado junto al asset, montar e instalar:

```bash
V=0.16.1
BASE="https://github.com/nexu-io/open-design/releases/download/open-design-v$V"
curl -sL -O "$BASE/open-design-$V-mac-arm64.dmg.sha256"
curl -L  -O "$BASE/open-design-$V-mac-arm64.dmg"
shasum -a 256 -c "open-design-$V-mac-arm64.dmg.sha256"   # debe decir: OK

hdiutil attach -nobrowse -readonly "open-design-$V-mac-arm64.dmg"
cp -R "/Volumes/Open Design/Open Design.app" /Applications/
hdiutil detach "/Volumes/Open Design"
```

Verificá la firma antes de abrirla. La build oficial está **notarizada por Apple**, así que no hay que tocar Gatekeeper ni correr `xattr -d com.apple.quarantine`. Si el assessment no dice `Notarized Developer ID`, pará y no la abras:

```bash
spctl -a -vvv "/Applications/Open Design.app"
# esperado:
#   accepted
#   source=Notarized Developer ID
#   origin=Developer ID Application: Wei Huang (236R69AWW2)
```

Bundle id `io.open-design.desktop`. Ocupa ~648 MB instalada, porque trae los catálogos bundleados: **155 design systems, 166 skills, 117 design templates, 460 plugins**.

### Vía 2: Docker Compose

Pedí Docker antes de clonar nada (`docker --version`). Si falta: macOS `brew install --cask docker`, Linux `apt-get install docker.io docker-compose-plugin`, Windows Docker Desktop.

```bash
git clone https://github.com/nexu-io/open-design /tmp/open-design
cd /tmp/open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# UI en http://localhost:7456
```

Env vars reales (los `OPEN_DESIGN_*` que documentaba la versión previa de este doc **no existen**):

- `OD_API_TOKEN` — obligatorio en deploys Docker. Sin él el daemon queda sin auth gate.
- `OD_PORT` — puerto del daemon, default `7456`.
- `OD_BIND_HOST` — interfaz de bind, default `127.0.0.1`. Ponelo en una IP concreta (p.ej. una address de Tailscale) para limitar el acceso a esa interfaz.
- `OD_ALLOWED_ORIGINS` — necesario detrás de reverse proxy.
- `OD_ALLOWED_INTERNAL_HOSTS` — allowlist de endpoints de modelo self-hosted (el daemon tiene protección SSRF y por default los bloquea).

### Vía 3: from source

```bash
git clone https://github.com/nexu-io/open-design /tmp/open-design
cd /tmp/open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Gotcha: pide Node `~24.x`. Con Node 26 global vas a necesitar aislarlo (`nvm` / `mise` / `fnm`), y `corepack` no viene con Node instalado por Homebrew. Puerto asignado dinámicamente, no 7456.

## Runtime: dónde vive todo (desktop app)

Esto importa para el bridge a Path E y para debuggear. La app **no** escribe en el proyecto del user ni en `./.od/`.

```
~/Library/Application Support/Open Design/
  installation.json
  namespaces/release-stable/
    data/
      app-config.json        # onboarding, agent elegido, design system, telemetría
      app.sqlite             # projects, conversations, messages, runs, templates
      projects/              # <-- artifacts generados por proyecto
      artifacts/  brands/  library/  memory/  plugins/  connectors/
    logs/{desktop,daemon,web,launcher}/latest.log
    runtime/desktop-root.json
```

**Puerto dinámico, no 7456**: la desktop app levanta tres procesos (desktop, daemon, web sidecar) y cada uno toma un puerto libre en el arranque, distinto en cada sesión. El daemon publica el suyo en su log:

```bash
tail -20 ~/Library/"Application Support"/Open\ Design/namespaces/release-stable/logs/daemon/latest.log
# ...{"state":"running","desktopAuthGateActive":true,"url":"http://127.0.0.1:50027"}
curl -s http://127.0.0.1:50027/api/health   # {"ok":true,"version":"0.16.1"}
```

La coordinación entre procesos va por sockets Unix en `/tmp/open-design/ipc/release-stable/{daemon,desktop,web}.sock`. Por eso **buscar 7456 con `lsof` en la desktop app da vacío**: ese puerto es solo del modo daemon web/Docker.

**Telemetría ON por default**: `app-config.json` arranca con `telemetry.metrics: true` y `telemetry.content: true` (esto último manda contenido, no solo métricas). Relay a `telemetry.open-design.ai` + PostHog. `artifactManifest` sí viene en `false`. Si el brief del proyecto es sensible, decile al user que lo apague en Settings → Privacy antes de pegar contexto de producto.

## CLI `od`

El binario vive dentro del bundle y corre con el Node del sistema:

```bash
OD_CLI="/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs"
node "$OD_CLI" --help
```

**Colisión de nombres**: `od` ya existe en macOS y Linux (`/usr/bin/od`, el volcado octal de coreutils). No hagas un alias `od` a ciegas. Si querés un shim, usá otro nombre (`odesign`) o un path absoluto. La forma que el propio help recomienda para agentes es `"$OD_NODE_BIN" "$OD_BIN" tools ...`, justamente para no depender del PATH.

Subcomandos útiles para este path: `od tools directions` (imprime la paleta y los font stacks de una design direction, ideal para el bridge), `od tools design-systems read`, `od export <file> --format pdf|image|pptx`, `od plugin`, `od automation`, `od diagnostics export`.

## Integración MCP con el coding agent

`od mcp` levanta un MCP server stdio que proxea al daemon corriendo. **No uses `node <cli> mcp` a secas**: sin más contexto el CLI cae al default `http://127.0.0.1:7456` (puerto del modo Docker) y toda tool call muere con `cannot reach the Open Design daemon`, porque la desktop app usa puerto dinámico.

La config canónica la publica la propia app en **Settings → MCP server** — copiala de ahí. Evita el puerto por completo: habla con el daemon vía socket Unix (`OD_SIDECAR_IPC_PATH`, path fijo entre arranques) y corre sobre el Electron Helper del bundle (`ELECTRON_RUN_AS_NODE=1`), no sobre el node del sistema. Forma general (paths verificados a 0.16.1):

```bash
claude mcp add-json --scope user open-design '{
  "command": "/Applications/Open Design.app/Contents/Frameworks/Open Design Helper.app/Contents/MacOS/Open Design Helper",
  "args": ["/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs", "mcp"],
  "env": {
    "OD_DATA_DIR": "$HOME/Library/Application Support/Open Design/namespaces/release-stable/data",
    "OD_SIDECAR_IPC_PATH": "/tmp/open-design/ipc/release-stable/daemon.sock",
    "ELECTRON_RUN_AS_NODE": "1"
  }
}'
claude mcp get open-design    # Status: ✔ Connected
```

(`add-json` no expande `$HOME` — usa el path absoluto real, como lo imprime la app.) Claude Code carga MCP servers al arrancar: tras registrar, **quit + reopen** de la sesión para que las tools `mcp__open-design__*` aparezcan.

Scope `user`, no `project`: es una herramienta de la máquina del dev, no una dependencia del repo, y no debe entrar en `.mcp.json` compartido.

Expone **18 tools**: `list_projects`, `get_active_context`, `get_artifact`, `get_project`, `get_file`, `search_files`, `list_files`, `create_artifact`, `write_file`, `delete_file`, `delete_project`, `create_project`, `list_skills`, `list_plugins`, `start_run`, `get_run`, `cancel_run`, `list_agents`.

Cuatro de esas escriben o borran (`write_file`, `delete_file`, `delete_project`, `create_artifact`). `delete_project` es irreversible y exige `confirm: true`. Aplican las reglas normales de confirmación antes de invocarlas.

El MCP requiere que la app esté abierta: si el daemon no corre, las tool calls fallan. `get_artifact` y `get_file` resuelven contra el proyecto/archivo **activo en la UI** cuando omitís `project`, lo que hace muy barato el "traeme el diseño que tengo abierto".

**README drift**: el README anuncia `od mcp install <agent>` para auto-registrar en claude/codex/cursor/etc. Ese subcomando **no existe en 0.16.1**; el registro es manual como arriba. Re-chequealo en releases futuros antes de citarlo.

## Instalar TU design system como paquete de usuario (repo → OD)

Path C originalmente fluye OD → repo (iterar allá, convertir acá). El flujo inverso también existe y es prerequisito cuando el repo YA tiene un `DESIGN.md` congelado (Rule #15): antes de generar nada en Open Design, espejá el design system del proyecto como paquete de usuario para que toda generación herede los tokens reales en vez de inventar una paleta.

**Formato**: mismo contrato que los ~151 bundleados — `manifest.json` + `DESIGN.md` (Google Labs, igual que el del repo) + `tokens.css`, opcional `USAGE.md`. Contratos en `<bundle>/Contents/Resources/open-design/design-systems/_schema/` (leé `AGENTS.md` ahí).

**Ubicación** (no documentada; verificada en el código del daemon 0.16.1 — `USER_DESIGN_SYSTEMS_DIR = join(RUNTIME_DATA_DIR, "design-systems")`):

```
~/Library/Application Support/Open Design/namespaces/release-stable/data/design-systems/<slug>/
  manifest.json    # schemaVersion "od-design-system-project/v1", source.type "local"
  DESIGN.md        # copia verbatim del contrato del repo + header de provenance
  tokens.css       # compilado desde la implementación viva (globals.css), NO re-elegido
  USAGE.md         # opcional: read-order + reglas para el agente generador
```

Procedimiento:

1. **Drift check primero**: diff tokens del `DESIGN.md` del repo vs la implementación viva (`app/globals.css` / equivalente). Divergencia → parar y reportar antes de espejar. Ojo con falsos positivos de formato (`0.1` vs `0.10`).
2. **tokens.css**: el esquema de OD son ~57 slots orientados a página de marketing (`--bg/--surface/--fg/--muted`, `--space-1..12` hasta 48px, 3 semánticos). Un design system de app densa no cabe: bindeá cada slot por ROL al valor real del repo, y re-exportá el vocabulario nativo completo (ramps, signal palette, etc.) como C-extensions — el esquema lo permite explícitamente. Slots sin spec en el repo → autoralos marcados `[authored]` low-confidence.
3. **manifest.json**: `source: {"type": "local", "path": "<repo>", "importedAt": "<fecha>"}`.
4. **Publicar** — los paquetes de usuario aparecen `status: "draft"` y los proyectos NO pueden usarlos (`400 DESIGN_SYSTEM_NOT_PUBLISHED`). Sin UI evidente para esto; por API:

```bash
# catálogo re-escanea en cada request, sin restart; el id lleva prefijo "user:"
curl -X PATCH "$DAEMON_URL/api/design-systems/user%3A<slug>" \
  -H "Content-Type: application/json" -d '{"status":"published"}'
```

5. **Smoke test**: `create_project` (MCP) con `designSystem: "user:<slug>"` → debe devolver el proyecto con ese `designSystemId`. Borrá el proyecto de prueba después.

En `USAGE.md` decile al agente generador que prefiera los nombres nativos de tokens: un artifact que usa `--bg-2`/`--pass-bg` (o los del repo que sea) se porta de vuelta sin pase de renombrado.

## User iteration (en la UI)

Primer arranque: `app-config.json` queda con `onboardingCompleted: false` hasta que el user completa el wizard en la GUI. Eso incluye la decisión de privacidad y elegir el motor de modelo, así que **no se puede automatizar**: es acción del user.

Después, guialo por estos pasos:

1. **Create new project** → nombre + workspace local.
2. **Pick a skill** del catálogo (166 bundleadas): `web-prototype`, `dashboard`, `saas-landing`, `deck`, etc. Le dice al motor qué tipo de output querés.
3. **Pick a design system** (155 en el catálogo, mismo origen que `getdesign`). Se puede previsualizar la paleta antes de comprometerse.
4. **Provide brief**: contexto de producto (industria, tone, target persona, competitor references). Si hay PRD, sugerile copiar el executive summary. Para screen mockups, acá va el `BRIEF.md`.
5. **Iterate**: el motor es BYOK. Auto-detecta CLIs de coding agents en el PATH (claude, codex, cursor-agent, opencode, devin, ...) y les proxea los mensajes por spawn de child process. Si no detecta ninguno, el user mete una API key de cualquier endpoint OpenAI-compatible en Settings → BYOK. Alternativa paga: Open Design Cloud.

Decile explícito: "Itera todo lo que quieras en la UI. Cuando estés conforme con la dirección visual, volvé acá y avisame." No mires por arriba del hombro: el valor de este path es la exploración libre.

## Output collection

Los artifacts van al project dir bajo el data root, no al repo:

```
~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/<project>/
  index.html         # principal, preview completo
  *.pdf  *.pptx  *.zip  *.png
```

Metadata en `data/app.sqlite` (tablas `projects`, `conversations`, `messages`, `run_devloop_iterations`, ...).

Para sacarlos sin cavar en el filesystem: `od export <file> --project <id> --format pdf|image|pptx --out <path>`, que usa el Chromium del runtime y no gasta llamadas al modelo.

**Estos NO son `DESIGN.md`**. Open Design no emite el formato Google Labs, emite HTML/PDF/PPTX/ZIP. Por eso este path tiene una etapa de conversión obligatoria.

## Bridge step to Path E

Una vez que el user confirma que está conforme:

1. **Capturá los inputs**: el design-system slug elegido en step 3 (visible en project settings, o `app-config.json` → `designSystemId`), y cualquier custom token tweakeado durante la iteración. `od tools directions --label <label> --json` te da la spec completa de la direction para no adivinar tokens.
2. **Listá los artifacts** bajo el project dir que el user considera "final" (puede haber varias iteraciones, preguntá cuál es la canónica). Si el MCP está registrado, `get_artifact` te trae el entry file más todos sus siblings referenciados (tokens CSS, módulos JSX, assets) en una sola call, que es más barato que N `get_file`.
3. **Delegate a `references/llm-authored.md`** con este input concatenado al briefing estándar:

   > "User iterated in Open Design with design-system `<slug>` and produced these artifacts: `<paths>`. Use the design-system base as a starting point, refine with the visual decisions evident in the HTML (extract tokens from `index.html` inline styles or `<style>` blocks)."

4. Path E corre con esos inputs como contexto extra y produce el `DESIGN.md` final en el root del proyecto siguiendo el spec de Google Labs.

Why bridge a Path E en vez de transformar directo: el spec de Google Labs (YAML frontmatter + 8 secciones prescritas + lint con `@google/design.md`) es estricto. La conversión es un acto de síntesis (qué del HTML va al frontmatter vs al prose, qué tokens prevalecen cuando el design system base y los tweaks del user chocan), no un parse mecánico. Path E ya tiene esa lógica documentada, no la dupliques acá.

## Cleanup

Después de que Path E confirma `DESIGN.md` generado y `lint` exit 0:

- **Desktop app**: cerrala (Cmd+Q). El daemon muere con ella y libera los sockets. No hace falta desinstalar: los proyectos quedan en el data root si el user quiere re-iterar en otra sesión. Si fue one-shot y quiere limpiar de verdad, avisale que borrar `~/Library/Application Support/Open Design/` **elimina todos sus proyectos** y es irreversible. Que lo decida él.
- **Docker**: `cd /tmp/open-design/deploy && docker compose down`. Preguntale antes de `-v`: ese flag borra el volume con los proyectos.

## Troubleshooting

| Síntoma                                                        | Causa probable                                                          | Fix                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `lsof -i:7456` vacío con la desktop app abierta                | La desktop app usa puerto dinámico + sockets Unix; 7456 es solo Docker  | Leé la URL real en `logs/daemon/latest.log`; verificá con `/api/health`                                                |
| `curl` al daemon da `404` en `/`                               | Normal: la raíz la sirve el web sidecar, no el daemon                    | Probá `/api/health`; la UI la abre la propia app                                                                       |
| `docker compose up` falla con `port already allocated`         | 7456 ocupado                                                            | `OD_PORT=7800 docker compose up -d`, abrir `localhost:7800`                                                            |
| UI dice "No coding agent detected"                             | No encontró claude / cursor / codex en el PATH                          | Settings → BYOK con cualquier key OpenAI-compatible, o instalar el CLI faltante y reload                               |
| La app no abre y macOS habla de un dev no identificado         | Descarga corrupta o build no oficial                                    | Re-verificá `shasum -a 256 -c` y `spctl -a -vvv`. Si no dice `Notarized Developer ID`, no la abras                     |
| MCP `open-design` conectado pero las tools fallan              | El daemon no corre                                                      | Abrí la app; `od mcp` proxea al daemon, no lo levanta                                                                  |
| `od: command not found`, o `od` imprime octal                  | No hay `od` de Open Design en el PATH; `/usr/bin/od` es coreutils        | Invocá `node "$OD_CLI"` con path absoluto al `daemon-cli.mjs`                                                          |
| `create_project` da `400 DESIGN_SYSTEM_NOT_PUBLISHED`          | Paquete de usuario recién instalado queda en `status: "draft"`          | `PATCH /api/design-systems/user%3A<slug>` con `{"status":"published"}` (ver sección repo → OD)                         |
| `data/projects/` vacío después de la iteración                 | El render no completó (timeout o el CLI del agent murió)                | Re-correr el brief desde la UI; `tail -f logs/daemon/latest.log`; `od diagnostics export` para un bundle de soporte    |
| El artifact final no representa lo que el user vio             | Cache stale                                                             | Hard reload (Cmd+Shift+R), re-exportar                                                                                |
| Path E genera un `DESIGN.md` que no se parece a lo iterado     | El bridge no pasó los artifacts correctamente                           | Verificar que la delegación incluya los paths exactos de los HTML y el slug; re-correr con inputs explícitos           |
