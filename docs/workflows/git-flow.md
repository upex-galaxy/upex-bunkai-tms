# Flujo Git - Proyecto AI-Driven

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** Developers trabajando con herramientas AI

---

## Filosofía del Flujo

La AI genera código y lo commitea inteligentemente, pero **tú mantienes el control** en los puntos clave: la política de push a una branch protegida (la fijás vos en `git_strategy.policy`) y qué se mergea.

> **Fuente de verdad:** la estrategia activa de CADA proyecto vive en el bloque `git_strategy:` de `.agents/project.yaml`, y la skill `git-flow-master` la lee y adapta cada commit, branch, push y PR a ella. Este documento explica los conceptos con un sabor de referencia (**main + staging**); tu proyecto puede usar otro.

---

## Estrategias

`git-flow-master` soporta varias estrategias de branching (el catálogo con sus trade-offs está en `.agents/skills/git-flow-master/references/branching-strategies.md`). Las más comunes:

| Estrategia         | Branches largas               | Cuándo encaja                                            |
| ------------------ | ----------------------------- | -------------------------------------------------------- |
| `solo-main`        | `main`                        | Un solo mantenedor, prototipos. Es el valor por defecto que trae el boilerplate |
| `main-integration` | `main` + `staging` (o `dev`)  | Un equipo con ambiente de staging y promoción a producción |
| `github-flow`      | `main` + `feature/*` cortas   | `main` siempre deployable, todo entra por PR             |

`meta.strategy_source` en el mismo bloque dice si alguien eligió la estrategia (`chosen`) o si es la heredada del template (`inherited`). Con `inherited`, `git-flow-master` ofrece correr **Strategy Setup** en el primer pedido de git: elige el flujo, crea las branches que necesita y escribe el bloque. Pedilo cuando quieras con "configura el flujo de git".

La política de protección declarada (`git_strategy.policy`) es una intención. Lo que el host realmente exige se verifica con `bun run git:policy verify`, que consulta las branch protections clásicas y los rulesets de GitHub.

---

## Estructura de Branches (sabor main + staging)

### main

Código de producción. Solo recibe merges desde `staging` a través de pull requests aprobados.

### staging

Branch de integración. Aquí entran las features terminadas antes de promoverse a producción. Representa tu ambiente de pre-producción.

### feature/nombre-tarea

Una branch por funcionalidad específica. La AI crea estas branches cuando inicias una nueva tarea, con el prefijo según el cambio dominante (`feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`) y la key de Jira cuando existe.

**Ejemplos de nombres:**

- `feat/UPEX-123-login-validation`
- `fix/UPEX-456-discount-rounding`
- `refactor/split-auth-utils`

---

## Ciclo Típico de Trabajo

### 1. Iniciar Nueva Tarea

```bash
# Desde la branch base de tu estrategia (staging en este sabor)
git checkout staging
git pull origin staging
git checkout -b feat/UPEX-123-nombre-tarea
```

Para trabajar en paralelo sin mezclar cambios (otra sesión de AI, un hotfix mientras una feature sigue abierta), usa un **worktree**: un segundo directorio de trabajo sobre su propia branch. Ver [Worktrees](#worktrees).

### 2. Desarrollo con AI

- Das instrucciones a la AI sobre qué construir
- La AI genera código y lo agrupa en commits semánticos
- Cada commit es pequeño, funcional e independiente

### 3. Commits Agrupados

La AI analiza cambios y propone commits separados, y espera tu OK antes de ejecutarlos:

**feat:** Nueva funcionalidad

```
feat: agregar validación de email en formulario
```

**fix:** Corrección de bugs

```
fix: corregir cálculo de descuento en checkout
```

**refactor:** Mejoras de código existente

```
refactor: optimizar queries de base de datos
```

**test:** Tests nuevos o modificados

```
test: agregar casos de prueba para login
```

**docs:** Documentación

```
docs: actualizar README con nuevas variables de entorno
```

### 4. Push

Pushear tu branch de trabajo es libre. Pushear directo a una branch protegida (`main`, o `staging` en este sabor) depende de `git_strategy.policy.direct_push_to_protected`:

| Valor       | Qué hace la AI                                               |
| ----------- | ------------------------------------------------------------ |
| `confirm`   | Pregunta antes de cada push a la branch protegida            |
| `forbidden` | Se niega y lleva el trabajo por PR                           |
| `allowed`   | Pushea directo sin preguntar: el valor ya es tu autorización |

Si el bloque `git_strategy` falta o está en `null` (proyecto recién scaffoldeado), se comporta como `confirm`. La variable decide, no la AI (`AGENTS.md` Regla #4): con `allowed` preguntar igual la convertiría en `confirm`. Nunca usa `--force` ni `--no-verify`.

### 5. Pull Request

Cuando la feature está completa:

- La AI pushea la branch y crea el PR con `gh pr create`, hacia la base que dicta la estrategia (`staging` en este sabor, `main` en `solo-main` o `github-flow`)
- Revisas los cambios en GitHub
- Apruebas y haces merge: **la AI se detiene al crear el PR**, el merge es tuyo

Si un cambio supera unas 400 líneas, `git-flow-master` propone partirlo en PRs encadenados (stacked) antes de empezar.

---

## Ventajas de Este Sistema

| Ventaja              | Descripción                                                         |
| -------------------- | ------------------------------------------------------------------- |
| **Historial limpio** | Cada commit cuenta una historia clara de qué problema resolvió      |
| **Reversibilidad**   | Puedes revertir cambios específicos sin destruir todo el trabajo    |
| **Control humano**   | La AI ejecuta, pero tú decides qué llega a las branches protegidas  |
| **Iteración rápida** | Trabajas en tu branch sin tocar `main` hasta estar satisfecho       |

---

## Flujo Visual (sabor main + staging)

```
main ─────────────●─────────────●─────────────●
                   ↑             ↑             ↑
                   PR            PR            PR
                   │             │             │
staging ───●───●───●───●───●─────●───●───●─────●
            ↑   ↑       ↑   ↑
            │   │       │   │
feature/x ──●───●       │   │
                        │   │
feature/y ──────────────●───●
```

---

## Worktrees

Un worktree es una segunda carpeta de trabajo del mismo repo, sobre su propia branch. Sirve para correr dos sesiones de AI en paralelo sin que una pise los cambios sin commitear de la otra.

- Un worktree nuevo trae solo los archivos versionados. `bun run worktree:provision` (corrido desde el worktree) copia lo que falta: `.env`, `.vercel/`, settings locales, `node_modules` y el alias `.claude/skills` (los MCP leen ese `.env` con el loader; no se deriva ningún archivo de credenciales)
- Antes de borrarlo, `bun run worktree:audit` lista lo que el worktree tiene y git no; `--rescue` copia el estado de sesión (`.session/`) a la carpeta principal sin sobrescribir nada
- En Orca, `orca.yaml` en la raíz corre ambos scripts solo, al crear y al archivar un worktree

Detalle completo: `.agents/skills/git-flow-master/references/worktrees.md`.

---

## Comandos Útiles

### Ver Estado Actual

```bash
git status
git log --oneline -10
```

### Ver Diferencias Antes de Commit

```bash
git diff
git diff --stat
```

### Deshacer el Último Commit (mantiene cambios)

```bash
git reset HEAD~1
```

Solo para un commit que **todavía no pusheaste**. Un commit ya pusheado se corrige con un commit nuevo, nunca reescribiendo la historia (`AGENTS.md` Regla #5).

### Ver Historial de Branches

```bash
git log --graph --oneline --all
```

> **Nunca descartes cambios en todo el repo** (`git restore .`, `git checkout -- .`, `git reset --hard`, `git stash` sin ruta, `git clean -f`): si otra sesión comparte la carpeta, borras su trabajo sin recuperación (`AGENTS.md` Regla #13). Descarta solo las rutas que tocaste.

---

## Buenas Prácticas

1. **Un commit = una responsabilidad:** No mezcles fix con features
2. **Mensajes claros:** Alguien debería entender qué hace sin ver el código
3. **Push frecuente en features largas:** No acumules días de trabajo sin backup
4. **PRs pequeños:** Más fáciles de revisar y aprobar
5. **Tests antes de merge:** Asegura que nada se rompe

---

## Integración con GitHub

Este flujo se apoya en el CLI `gh` (que la skill `git-flow-master` opera), y permite a la AI:

- Ver pull requests existentes
- Crear nuevos PRs con descripción automática
- Listar issues y vincularlos a commits
- Revisar estado de checks automáticos

Sin `gh` autenticado (`gh auth status`), la AI se detiene antes de crear el PR y te lo dice; no simula uno.

---

## Convenciones de Commits

### Formato Estándar

```
<tipo>(<KEY-123>): <descripción breve>

[cuerpo opcional]

Worktree: <nombre del worktree | primary>
Session: <etiqueta de la sesión>
```

Sin key de Jira, el formato es `<tipo>: <descripción breve>`.

### Trailers forenses

Todo commit que escribe una sesión de AI termina con dos líneas: `Worktree:` y `Session:`. Dicen qué carpeta de trabajo y qué sesión produjeron el commit, para encontrar la conversación correcta en un bisect o un post-mortem. La AI las copia de la línea `AGENT IDENTITY:` que el hook inyecta en cada turno (`unknown` cuando no se pudo resolver).

No son atribución: no nombran ninguna herramienta. Siguen prohibidas las líneas tipo "Generated with…", un `Co-Authored-By:` de una AI y cualquier trailer con marca de harness (`Claude-Session:`). `.husky/commit-msg` avisa, sin bloquear, si faltan o si aparece uno prohibido. Decisión en `.context/ADR/ADR-0004-harness-agnostic-commit-trailers.md`.

### Tipos de Commits

| Tipo       | Uso                                            |
| ---------- | ---------------------------------------------- |
| `feat`     | Nueva funcionalidad                            |
| `fix`      | Corrección de bug                              |
| `refactor` | Reestructuración sin cambio de comportamiento  |
| `test`     | Agregar o modificar tests                      |
| `docs`     | Solo documentación                             |
| `chore`    | Tareas de mantenimiento                        |
| `style`    | Formato, espacios, etc. (sin cambio de lógica) |

### Ejemplos Buenos vs Malos

```
✅ feat: implementar filtro de búsqueda por fecha
✅ fix: corregir validación de email vacío
✅ test: agregar casos edge para calculadora de precios

❌ update code
❌ fix stuff
❌ WIP
```

---

## Navegación

- [Ambientes](./environments.md) - Entender local, staging, producción
- Skill `/git-flow-master` - Operador completo de git (`.agents/skills/git-flow-master/SKILL.md`)
