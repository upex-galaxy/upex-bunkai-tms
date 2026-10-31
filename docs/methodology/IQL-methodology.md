# Cómo el dev le entrega trabajo a QA

> **Idioma:** Español
> El lado dev de la costura con QA. La metodología de testing (IQL) no vive en este repo: vive en [agentic-qa-boilerplate](https://upex-galaxy.github.io/agentic-qa-boilerplate/docs/core/metodologia/index.html).

Este boilerplate cubre el desarrollo: definir, construir, revisar y desplegar cada historia. Probarla es trabajo del equipo de QA, que tiene su propio repo, sus propias skills y su metodología, el **Integrated Quality Lifecycle (IQL)**. Esta página describe el punto exacto donde una historia cambia de manos: qué deja el dev, dónde lo deja y qué lee QA.

---

## Dónde se toca el trabajo del dev con IQL

| Momento           | Lado dev (este repo)                                                            | Lado QA                                                                      |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Antes de codear   | `/product-management` refina la historia y sus criterios de aceptación          | revisión shift-left de los criterios (estado `Shift-Left QA` de la historia) |
| Mientras se codea | `/sprint-development` etapas 1 a 3; `/unit-testing` arma la base de la pirámide | prepara el plan de pruebas de la historia                                    |
| La entrega        | etapa 4: merge, deploy a staging, historia en `Ready For QA`                    | toma la historia y empieza a probar                                          |
| Después de probar | etapa 5, solo con QA en verde y aprobación del negocio                          | firma la historia o abre bugs                                                |

Los nombres de estados de esta tabla son los del catálogo por defecto. Los de tu instancia están en `.agents/jira-workflows.json` (lo regenera `bun run jira:sync-workflows`).

---

## Qué deja el dev para QA

### 1. La historia en `Ready For QA`

La etapa 4 de `/sprint-development` termina cuando el merge está hecho y el deploy de staging está verde. Ahí la automatización de Jira mueve la historia a `Ready For QA`; si no lo hace, la skill dispara la transición y vuelve a leer el estado.

Ninguna skill de desarrollo mueve una historia más allá de ese punto. Empezar a probar, firmar y liberar son transiciones de QA y de quien hace el release. La tabla completa por tipo de issue está en `.agents/skills/agentic-dev-core/references/artifact-lifecycle.md`.

### 2. Un deploy de staging verificado por SHA

La etapa 4 no se da por cumplida porque el push salió bien: consulta el deployment del commit mergeado hasta que figura `READY`. Con una estrategia sin rama de integración (como `solo-main`, el valor por defecto de `git_strategy`), el staging de la historia es el Preview deployment de la rama del PR.

### 3. La página `/qa` de la app

`/testability-guide` genera dentro de la app una página pública, la _Software Testability Guide for QA_: arquitectura, usuarios de demo, cómo probar por base de datos, por API y por UI. No contiene secretos: los valores reales viven en un artefacto de credenciales aparte (por defecto, una épica de Jira) al que la página enlaza.

La cabecera de `/qa` muestra el **SHA del build** desplegado (`data-testid="qa-build-sha"`). Lo lee en tiempo de ejecución de la variable de la plataforma (en Vercel, `VERCEL_GIT_COMMIT_SHA`), así que QA puede confirmar que el entorno que prueba es el que contiene el merge de la historia. Sin SHA, la página lo dice en lugar de mostrar un valor viejo.

### 4. El plan y el PR

El plan de implementación de la historia vive en su campo de Jira (`spec_implementation_plan`), y el de la épica en `feature_implementation_plan`. Junto con el PR, le dicen a QA qué cambió y qué quedó fuera de alcance.

---

## El camino de vuelta: bugs

Cuando QA abre un bug, `/sprint-development` lo toma con su flujo de bugs: análisis de causa raíz, triage (bug real, duplicado, funciona como se diseñó, no reproducible, diferido), fix con PR y deploy. El bug vuelve a `Ready For QA` y el retest es de QA.

---

## Qué lee el dev del lado de QA

El dev no escribe artefactos de prueba, pero los lee. Los planes de prueba que QA guarda en Jira llegan a la caché local `.context/PBI/` con `bun run context:hydrate`, en modo solo lectura. Qué se sincroniza y qué no está en [jira-platform.md](./jira-platform.md).

---

## La metodología completa

- [Metodología IQL](https://upex-galaxy.github.io/agentic-qa-boilerplate/docs/core/metodologia/index.html) en el sitio publicado del repo de QA: fases, etapas y pasos.
- [agentic-qa-boilerplate](https://github.com/upex-galaxy/agentic-qa-boilerplate): el repo hermano, con las skills de testing de sprint, regresión y automatización.
