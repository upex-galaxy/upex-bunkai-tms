# Jira y Xray desde el lado dev

> **Idioma:** Español
> Qué lee y qué escribe este repo en Jira, incluidos los artefactos de Xray que publica QA. La gestión de pruebas en Xray (crear tests, importar resultados, reportes de CI) es del [repo de QA](https://github.com/upex-galaxy/agentic-qa-boilerplate).

Jira es la fuente de verdad del trabajo. Este repo no tiene una copia editable de él: `scripts/sync-jira-issues.ts` lo baja a una caché local de solo lectura, `.context/PBI/`, que se reconstruye con `bun run context:hydrate`. Cuando un dev necesita cambiar algo, lo escribe en Jira y vuelve a sincronizar.

---

## La instancia y las credenciales

| Dato              | Dónde vive                                             | Cómo se lee                                                                |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Host de Atlassian | `.agents/project.yaml` → `issue_tracker.atlassian_url` | `bun run jira:url` (con `--slug`, el host pelado que espera `acli --site`) |
| Clave de proyecto | `.agents/project.yaml`                                 | la resuelven las skills al cargar el proyecto                              |
| Email y API token | `.env` (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`)      | nunca se copian a un archivo versionado                                    |

El host no es una variable de entorno a propósito: una segunda copia es la que queda vieja después de mudar el sitio. Para mudar de instancia existe `/jira-administration instance-migration`. Setup de credenciales paso a paso: [Jira (lado dev)](../setup/README.md#jira-lado-dev).

---

## Qué escribe el dev

| Campo                                 | Issue                     | Lo escribe                                    |
| ------------------------------------- | ------------------------- | --------------------------------------------- |
| `spec_implementation_plan`            | historia                  | `/sprint-development`, etapa 1                |
| `feature_implementation_plan`         | épica                     | `/sprint-development`, plan macro de la épica |
| descripción y criterios de aceptación | épica, historia           | `/product-management`                         |
| transiciones de estado                | historia, bug, tech story | `/sprint-development`, hasta `Ready For QA`   |

Si un campo no existe en tu instancia, el contenido va como comentario estructurado (`## <etiqueta>`), según el `fallback` que declara `.agents/jira-required.yaml`. La sincronización deja un stub que apunta a ese comentario. `bun run jira:sync-fields` descubre los campos custom de la instancia y regenera `.agents/jira-fields.json`, el catálogo con el que las skills los nombran por slug.

---

## Qué lee el dev del lado de QA

Un mismo workspace de Jira puede servir a los dos repos, así que `.agents/jira-required.yaml` declara también los artefactos de QA. El dev los lee para saber qué se va a probar; nunca los escribe.

| Artefacto de QA                            | Dónde lo deja QA                                         | Dónde aparece en la caché                                                                |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Feature Test Plan                          | campo `feature_test_plan` de la épica                    | `feature-test-plan.md` en la carpeta de la épica                                         |
| Acceptance Test Plan (sin Xray)            | campo `acceptance_test_plan` de la historia              | `acceptance-test-plan.md` en la carpeta de la historia                                   |
| Test Plan de Xray                          | descripción del issue `Test Plan` enlazado a la historia | `acceptance-test-plan.md` de la historia (gana sobre la copia del campo) y `test-plans/` |
| Test Execution / Re-Test Execution de Xray | descripción del issue enlazado                           | `acceptance-test-results.md` de la historia y `test-executions/`                         |
| Test Set, Pre-Condition                    | el issue de Xray                                         | `test-sets/`, `preconditions/`                                                           |
| Bugs y defectos enlazados                  | el issue                                                 | `bugs/`, `defects/`, o anidados bajo la historia                                         |

Dos reglas del sync que conviene conocer:

- **Altitud.** Solo un Test Plan titulado `ATP:` (o una Execution `ATR:` / `ReTest:`) cuenta como el de la historia. Los planes de feature, sprint o maestros (`FTP:`, `STP:`, `MTP:`) cuelgan más arriba y se saltean con un aviso.
- **Lo que no se baja.** Los resultados de cada corrida, la cobertura y la membresía interna de un Test Set viven en la API de Xray, que este repo no integra. Para eso está el tooling del repo de QA.

---

## Comandos

| Comando                                       | Qué hace                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `bun run context:hydrate`                     | reconstruye toda la caché `.context/PBI/`, con comentarios                                    |
| `bun run jira:sync-issues get <KEY>`          | un issue con todos sus campos; es la forma de leer campos custom (`acli` los devuelve vacíos) |
| `bun run jira:sync-issues pull --story <KEY>` | una historia con sus artefactos enlazados                                                     |
| `bun run jira:check`                          | compara el manifiesto con el catálogo de la instancia                                         |
| `bun run jira:sync-workflows`                 | regenera el catálogo de estados y transiciones                                                |

Los comandos exactos y sus flags los define `package.json` y la ayuda de cada script. La operación de `acli` (crear, transicionar, comentar) la documenta la skill `/acli`.

---

## Más información

- [Cómo el dev le entrega trabajo a QA](./IQL-methodology.md): la costura completa, con la página `/qa` y el deploy de staging.
- [Documentación de Xray Cloud](https://docs.getxray.app/display/XRAYCLOUD) y [API REST de Jira](https://developer.atlassian.com/cloud/jira/platform/rest/v3/).
