# Early-Game Testing

> **Idioma:** Español
> **Fase IQL 1** · Shift-Left · BDD · Risk-Based

## Overview

**"Construyamos bien desde el inicio"**

Fase de **Prevención** - Enfoque en prevenir defectos a través de colaboración y análisis temprano.

La **primera fase del Integrated Quality Lifecycle** donde el **QA Analyst** lidera la estrategia temprana. Como en gaming: **Dominar el Early-Game** te da una ventaja decisiva para toda la partida.

---

## Early-Game: Primera Fase de IQL

**Early-Game Testing** es la fase fundacional del **Integrated Quality Lifecycle** donde se establecen las bases estratégicas de calidad para todo el proyecto.

### Posición en la Línea de Tiempo de IQL

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ●══════════════════════════════════════════════════════════▶   │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐│
│  │  EARLY-GAME     │──▶│   MID-GAME      │──▶│   LATE-GAME     ││
│  │  ✅ FASE ACTUAL │   │   Siguiente     │   │   Futuro        ││
│  │                 │   │                 │   │                 ││
│  │  Steps 1-4      │   │   Steps 5-9     │   │   Steps 10-15   ││
│  │  QA Analyst     │   │   QA Automation │   │   QA + DevOps   ││
│  └─────────────────┘   └─────────────────┘   └─────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Características del Early-Game

| Aspecto           | Detalle                     |
| ----------------- | --------------------------- |
| **Steps**         | 1-4 de IQL                  |
| **Enfoques**      | Shift-Left, BDD, Risk-Based |
| **Rol Principal** | QA Analyst                  |
| **Herramientas**  | Jira, Confluence, Postman   |

> _"🎮 Early-Game: La Base de la Ventaja Estratégica"_
>
> Como en los MOBAs, **dominar el early-game te da ventaja para toda la partida**. En IQL, esta fase establece la **base estratégica de calidad** que facilita el éxito en las fases Mid-Game y Late-Game.

---

## Los 4 Steps del Early-Game Testing

**Early-Game Testing** se ejecuta a través de **4 steps específicos** correspondientes a los Steps 1-4 de IQL.

> _"Cada step tiene un objetivo específico dentro del TMLC (Test Manual Life Cycle) y se integra perfectamente con el flujo de desarrollo."_

### Step 1: Análisis de Requisitos y Planificación

**TMLC - Test Manual Life Cycle (1er Stage)**

Entender los requisitos y finalizar los criterios de aceptación de la US antes de iniciar la implementación.

**Actividades Clave:**

- QA discute ambigüedades con stakeholders
- QA crea un Feature Test Plan (FTP) describiendo escenarios iniciales
- La subtarea 'QA: AC Review' y 'QA: Feature Test Plan' pasa de Open → In Progress → Done

**Resultado Esperado:**
Un conjunto claro de criterios de aceptación y un FTP para guiar el testing específico en la US.

**Herramientas:** Jira, Confluence, Slack, Claude Code

---

### Step 2: Desarrollo e Implementación

**Trabajo paralelo (No es una tarea directa de QA)**

Construir y desplegar la US en un ambiente de staging mientras QA prepara la estrategia.

**Actividades Clave:**

- Los desarrolladores crean una branch e implementan el código de la US
- El código se despliega al Ambiente correspondiente
- QA puede probar la US en la misma branch de desarrollo si es posible

**Resultado Esperado:**
Un ambiente funcional donde el equipo de QA puede comenzar a testear.

**Herramientas:** GitHub, Docker, TypeScript, Python

---

### Step 3: Ejecución de Testing Exploratorio Temprano

**TMLC - Test Manual Life Cycle (2do Stage) - Early-Gank**

Validar rápidamente la US usando Feature Test Execution (FTX) definido en el FTP.

**Actividades Clave:**

- La subtarea 'QA: Feature Testing' pasa de Open → In Progress → Done
- QA realiza testing exploratorio dirigido en áreas críticas o de alto riesgo
- Los hallazgos y defectos se reportan inmediatamente

**Resultado Esperado:**
La User Story puede desplegarse a producción una vez que QA la aprueba. La US se cierra en Jira.

**Herramientas:** Browser DevTools, Postman, Jira

---

### Step 4: Priorización Basada en Riesgo

**TMLC - Test Manual Life Cycle (3er Stage) - Risk-Based**

Decidir qué escenarios del FTP merecen test cases formales vs quedarse como exploratorios.

**Actividades Clave:**

- QA evalúa el impacto potencial y probabilidad de defectos para cada escenario
- Los escenarios de alto valor se seleccionan para convertirse en Test Cases
- Las decisiones se registran en un Test Repository (Epic en Jira)

**Resultado Esperado:**
Lista refinada de escenarios listos para convertirse en test cases con scripts.

**Herramientas:** Jira, Xray, Confluence

---

## Conceptos Clave del Early-Game Testing

### Shift-Left Testing

- **Descripción:** Involucrar a QA desde el inicio para descubrir defectos antes y reducir retrabajo.
- **Beneficio:** Prevención Temprana = Economía Optimizada

### Testing Exploratorio

- **Descripción:** El Feature Testing 'Exploratorio' proporciona validación rápida antes del cierre de la US.
- **Beneficio:** Feedback Ágil y Flexible

### Selección Basada en Riesgo

- **Descripción:** Dedicar recursos de QA a los escenarios de mayor impacto para documentación y automatización.
- **Beneficio:** Tiempo Invertido en lo que Importa

### Documentación Asíncrona

- **Descripción:** Diseñar test cases después de la aprobación de la US mantiene el proceso ágil sin bloqueadores.
- **Beneficio:** Entrega Sin Retrasos

---

## Enfoques Integrados en Early-Game Testing

Nuestra metodología integra **múltiples tipos de testing y estrategias** organizados en cinco categorías principales para crear cobertura comprensiva y estratégica.

### 1. Macro-Enfoques Estratégicos

Los tres enfoques fundamentales que guían toda la metodología de trabajo en UPEX:

#### Shift-Left Testing

- **Enfoque principal:** Involucrar al equipo de QA desde las etapas más tempranas del ciclo de desarrollo.
- **Objetivo:** Detectar defectos y ambigüedades al inicio para reducir costos y retrabajo.

#### Risk-Based Testing

- **Enfoque inteligente:** Desarrollar y priorizar tests clasificando escenarios por impacto y criticidad.
- **Objetivo:** Enfocar esfuerzos en Valor-Costo-Riesgo, evitando sobrecarga innecesaria de documentación.

#### Continuous Testing

- **Enfoque de automatización:** Integrar tests automatizados en el pipeline CI/CD para feedback inmediato.
- **Objetivo:** Mantener la calidad del software mediante validación constante y detección temprana de regresiones.

### 2. Enfoques por Método de Diseño y Ejecución

Definen cómo se diseñan y ejecutan los test cases:

#### Scripted Testing

- **Tests con Script:** Diseñados con pasos concretos, datos de entrada y resultados esperados.
- **Ideal para:** Escenarios repetitivos como regresión y cuando la trazabilidad es prioridad.

#### Exploratory Testing

- **Tests Exploratorios:** Basados en objetivos o hipótesis (charters) sin pasos rígidamente definidos.
- **Permiten:** Investigar el software libre y creativamente, descubriendo defectos en "rincones" menos explorados.

### 3. El "Tridente de Testing" - Competencias Técnicas Clave

Considerado el **conocimiento mínimo esencial** en UPEX. Define las **competencias técnicas fundamentales** que se aprenden y aplican con la metodología Early-Game Testing.

> **Nota importante:** El Tridente no son enfoques metodológicos, sino las **áreas de conocimiento técnico** que todo QA debe dominar.

#### E2E / Frontend Testing (Testing de Sistema)

Tests que validan el flujo completo desde la UI, simulando cómo un usuario real interactuaría con el sistema.

#### API Testing / Backend (Testing de Capa Lógica)

Tests a nivel lógico para validar la comunicación y respuestas entre diferentes servicios.

#### Database Testing (Testing de Capa de Datos)

Se enfoca en la capa de datos para asegurar la integridad y consistencia de la información.

### 4. Testing No Funcional - Aspectos de Calidad

Tests que evalúan aspectos de calidad más allá de la funcionalidad:

| Tipo                      | Descripción                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| **Performance Testing**   | Mide la carga y estrés que el sistema puede soportar                       |
| **Usability Testing**     | Evalúa qué tan fácil e intuitivo es el sistema para el usuario             |
| **Security Testing**      | Se enfoca en identificar vulnerabilidades de seguridad                     |
| **Accessibility Testing** | Asegura que la aplicación sea usable por personas con diversas capacidades |

### 5. Enfoques por Estrategia de Ejecución

Se aplican en momentos específicos del ciclo de vida para cumplir objetivos concretos:

| Enfoque                | Descripción                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Smoke Testing**      | Verificación rápida para validar que las funcionalidades esenciales funcionan. Decide si una versión es estable para testing profundo. |
| **Sanity Testing**     | Tests rápidos y superficiales después de cambios menores para validar que las funcionalidades principales siguen operando.             |
| **Regression Testing** | Ejecutar un conjunto amplio de tests para confirmar que nuevas modificaciones no afectaron funcionalidades existentes.                 |
| **Re-Testing**         | Se enfoca específicamente en re-testear funcionalidades que previamente tenían defectos para confirmar la corrección exitosa.          |
| **Feature Testing**    | Testing comprensivo de features individuales o user stories para validar funcionalidad completa antes de integración.                  |

> _"🎮 Early-Game Testing: Metodología Integral"_
>
> Esta **combinación estratégica de enfoques** permite a los QAs entrenados en UPEX abordar cualquier proyecto con una **ventaja temprana decisiva**, aplicando el enfoque correcto en el momento preciso para maximizar impacto y optimizar recursos.

---

## ¿Por qué "Early-Game"?

### La Estrategia Ganadora

En videojuegos competitivos (MOBA), los jugadores profesionales saben que **dominar el "early game"** es crucial para ganar la partida. Las decisiones y acciones que tomas en los primeros minutos determinan tu ventaja para el resto del juego.

| En Gaming Competitivo                                                                                                                                 | En QA Estratégico                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Controlar recursos temprano, posicionarse estratégicamente y tomar ventaja inicial para dominar el juego completo. **Economía de equipo optimizada.** | Aplicar feedback de calidad desde el inicio para dar ventaja decisiva al proyecto. **Economía de desarrollo optimizada.** |

---

## Early-Game Testing en la Práctica

Como QA entrenado en UPEX, no esperas a que el desarrollo termine. **Orquestas la calidad desde el análisis** para crear ventaja estratégica temprana.

### Control Estratégico

Participas en **análisis de requisitos** y **planificación estratégica** para identificar puntos débiles y crear planes de mitigación temprana.

- _Ventaja desde el Origen_

### Economía Optimizada

Realizas **testing exploratorio temprano** y **análisis de riesgos** para optimizar presupuesto y reducir costos de retrabajo.

- _Recursos Optimizados_

### Base Sólida

Construyes una **base de calidad sólida** que facilita la automatización, escalabilidad y mantenimiento a largo plazo.

- _Fundamento Estratégico_

---

## Tu Ventaja Competitiva en el Mercado

Los QAs entrenados en Early-Game Testing son altamente valorados porque **piensan estratégicamente** y aportan valor desde el día uno.

### Beneficios Clave

| Beneficio                            | Descripción                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Reducción Dramática de Costos**    | Detectar y corregir defectos temprano es hasta 100x más económico que hacerlo en producción. Optimizas la economía del proyecto. |
| **Tiempo de Desarrollo Optimizado**  | Evitas retrabajo y retrasos identificando problemas antes de que se propaguen. Control total de timeline.                        |
| **Liderazgo Natural**                | Te integras como líder técnico con equipos de desarrollo y producto, orquestando calidad desde el análisis.                      |
| **Impacto Estratégico Medible**      | Tu trabajo tiene impacto directo y cuantificable en el éxito del producto. Eres parte del equipo estratégico central.            |
| **Mentalidad de Gaming Competitivo** | Desarrollas pensamiento estratégico, análisis de riesgos y optimización de recursos que son altamente valorados.                 |
| **Diferenciación Única de CV**       | Destacas como QA que entiende el negocio, piensa estratégicamente y domina metodologías avanzadas.                               |

---

## Configuración del Ambiente de Trabajo

En UPEX Galaxy trabajas con las **mismas herramientas profesionales** que usarás en empresas reales. Tu experiencia será **100% transferible** al mercado laboral.

### Jira + Xray Integration

**Gestión de Proyectos & Gestión de Tests**

- **Jira:** Gestión completa de proyectos, user stories, bugs y seguimiento de progreso con metodologías ágiles.
- **Xray:** Gestión de tests integrada para diseño, ejecución y reportes de test cases con trazabilidad completa.

_📋 Documentación y trazabilidad profesional_

### GitHub + Actions CI/CD

**Control de Versiones & Automatización**

- **GitHub:** Control de versiones, colaboración en código de automatización y documentación de proyectos.
- **GitHub Actions:** Pipelines CI/CD para ejecución automática de tests y despliegue de builds.

_⚡ Automatización y Testing Continuo_

### Herramientas Complementarias

| Herramienta            | Uso                                                  |
| ---------------------- | ---------------------------------------------------- |
| **Slack**              | Comunicación en tiempo real con equipos distribuidos |
| **Postman**            | Testing de APIs y documentación de servicios         |
| **Playwright/Cypress** | Automatización de tests web y E2E                    |

**Experiencia 100% profesional:** Las mismas herramientas, workflows y metodologías que encontrarás en empresas de tecnología de primer nivel.

---

## Navegación

- [Metodología IQL](./IQL-methodology.md) - Vista completa del Integrated Quality Lifecycle
- [Mid-Game Testing](./mid-game-testing.md) - Fase 2: Detección e implementación
- [Late-Game Testing](./late-game-testing.md) - Fase 3: Observación y producción
