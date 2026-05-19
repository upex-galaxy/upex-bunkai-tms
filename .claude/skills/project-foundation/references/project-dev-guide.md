# Development Guide

Actúa como un **compañero senior** que conoce profundamente el proyecto y está explicando a otro desarrollador cómo funciona todo y qué considerar al trabajar en él.

---

## MISIÓN

Generar una **guía conversacional** que oriente a cualquier desarrollador (humano o IA) sobre:

- Cómo está estructurado el proyecto
- Qué considerar al trabajar en cada flujo
- Qué dependencias existen entre features
- Qué puntos de atención hay que tener en cuenta

**Filosofía:**

- **Conversacional:** Como si un compañero te explicara el proyecto
- **QUÉ, no CÓMO:** Orientar sobre qué considerar, no dictar pasos exactos
- **Asumir experiencia:** El lector ya sabe programar, solo necesita contexto del proyecto
- **Visual cuando ayude:** Usar diagramas ASCII para explicar relaciones y flujos

**NO incluir:** Snippets de código, templates, comandos específicos

**Prerequisito:** Debe existir `.context/business/business-data-map.md`

**Output:** `.context/business/project-dev-guide.md`

---

## FASE 0: VALIDACIÓN

### 0.1 Verificar Business Data Map

```
¿Existe .context/business/business-data-map.md?
  → NO: DETENER. Indicar que primero debe ejecutarse business-data-map.md
  → SÍ: Continuar
```

### 0.2 Comprender el Sistema

Leer el business-data-map.md y comprender:

- Entidades y sus roles de negocio
- Flujos principales y cómo se conectan
- State machines y sus transiciones
- Procesos automáticos
- Integraciones externas

### 0.3 Explorar la Estructura del Código

Identificar:

- Cómo está organizado el proyecto
- Dónde vive cada tipo de código
- Patrones que ya se usan

---

## FASE 1: GENERACIÓN DEL DOCUMENTO

### Genera: `.context/business/project-dev-guide.md`

El documento debe sentirse como una conversación con un compañero que conoce el proyecto.

---

### ESTRUCTURA DEL OUTPUT

```markdown
# Development Guide: [Nombre del Proyecto]

╔══════════════════════════════════════════════════════════════════════════════╗
║ GUÍA DE DESARROLLO ║
║ "Lo que necesitas saber para trabajar aquí" ║
╚══════════════════════════════════════════════════════════════════════════════╝

> Este documento asume que ya leíste `.context/business/business-data-map.md` para
> entender los flujos de negocio. Aquí te explico qué considerar al desarrollar.
```

---

#### 1. ENTENDIENDO EL PROYECTO

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🏗️ ENTENDIENDO EL PROYECTO │
└──────────────────────────────────────────────────────────────────────────────┘

## Cómo está organizado

[Descripción conversacional de la estructura del proyecto]

Por ejemplo:
"El proyecto sigue la estructura típica de [framework]. Lo importante es
entender que la lógica de negocio está separada de los handlers de API,
lo que facilita testear y modificar sin romper otras cosas..."

## Diagrama de la arquitectura

[Diagrama ASCII mostrando cómo se conectan las partes]

    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Routes    │ ──► │  Services   │ ──► │  Database   │
    │  (API/UI)   │     │  (Lógica)   │     │  (Supabase) │
    └─────────────┘     └─────────────┘     └─────────────┘
          │                   │
          │                   ▼
          │            ┌─────────────┐
          └──────────► │  External   │
                       │  Services   │
                       └─────────────┘

## El flujo general de datos

[Explicación conversacional de cómo viajan los datos]

"Cuando un usuario hace una acción, generalmente el flujo es..."
```

---

#### 2. TRABAJANDO CON CADA FLUJO

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔄 TRABAJANDO CON CADA FLUJO │
└──────────────────────────────────────────────────────────────────────────────┘

[Para cada flujo principal del business-data-map, explicar conversacionalmente
qué tener en cuenta al trabajar con él]

---

## Flujo: [Nombre del Flujo]

[Diagrama ASCII simplificado del flujo]

### Contexto

[Explicación de qué hace este flujo y por qué es importante]

"Este flujo es el corazón del sistema porque..."

### Qué tener en cuenta

[Puntos importantes a considerar, en tono conversacional]

"Si vas a modificar algo aquí, ten presente que:

- Este flujo está conectado con [otros flujos], así que cualquier cambio
  podría afectarlos...

- La entidad principal tiene una máquina de estados. Las transiciones válidas
  son específicas, así que no intentes saltar estados...

- Hay un trigger/webhook/cron que depende de esto. Si cambias la estructura,
  asegúrate de que siga funcionando..."

### Dependencias

[Diagrama o lista de qué depende de qué]

    Este flujo
         │
         ├──► afecta → [Flujo X]
         ├──► dispara → [Proceso automático Y]
         └──► notifica → [Integración Z]

---

[Repetir para cada flujo importante]
```

---

#### 3. LAS MÁQUINAS DE ESTADO

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📊 LAS MÁQUINAS DE ESTADO │
└──────────────────────────────────────────────────────────────────────────────┘

[Para cada entidad con estados, explicar qué considerar]

## [Entidad con estados]

[Diagrama ASCII de la máquina de estados]

### Por qué importa

"Esta máquina de estados es importante porque controla [qué]. Si intentas
hacer una transición inválida, [qué pasa]..."

### Cosas a recordar

- "El estado [X] es terminal, no se puede salir de él..."
- "Cuando pasas a [Y], se dispara [efecto secundario]..."
- "Solo [actor] puede hacer la transición de [A] a [B]..."
```

---

#### 4. PROCESOS AUTOMÁTICOS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚡ PROCESOS AUTOMÁTICOS │
└──────────────────────────────────────────────────────────────────────────────┘

"El sistema tiene varios procesos que corren automáticamente. Es importante
conocerlos porque pueden afectar tu trabajo..."

## [Proceso 1: Trigger/Cron/Webhook]

### Qué hace y cuándo

[Explicación conversacional]

### Por qué te importa

"Si estás trabajando en [área], este proceso podría [afectarte de esta manera]..."

### Diagrama del proceso

[Diagrama ASCII si ayuda a entender]

    Evento               Proceso              Efecto
       │                    │                   │
       ▼                    ▼                   ▼
    [trigger] ──────► [qué ejecuta] ──────► [resultado]
```

---

#### 5. INTEGRACIONES EXTERNAS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔗 INTEGRACIONES EXTERNAS │
└──────────────────────────────────────────────────────────────────────────────┘

"El sistema se conecta con servicios externos. Aquí te explico qué hace
cada uno y qué considerar..."

## [Servicio Externo]

### Qué hace en el sistema

[Explicación conversacional]

### Puntos de contacto

[Diagrama ASCII mostrando dónde toca el sistema]

### Qué considerar

"Cuando trabajes con algo que involucre [servicio], recuerda que:

- Los webhooks de este servicio llegan a [endpoint]...
- Si el servicio falla, el sistema [comportamiento]...
- Para desarrollo local, [consideración]..."
```

---

#### 6. PUNTOS DE ATENCIÓN

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ PUNTOS DE ATENCIÓN │
└──────────────────────────────────────────────────────────────────────────────┘

"Después de trabajar en este proyecto, estos son los puntos que más
sorprenden o causan problemas..."

## Cosas que podrían morderte

[Lista conversacional de gotchas y consideraciones]

- "**[Punto 1]:** Parece que [X], pero en realidad [Y]..."

- "**[Punto 2]:** Cuidado con [situación] porque [consecuencia]..."

- "**[Punto 3]:** Si ves [síntoma], probablemente es porque [causa]..."

## Dependencias no obvias

[Diagrama ASCII si ayuda]

"Hay algunas conexiones que no son obvias a primera vista:"

    [Cosa A] ──── afecta secretamente ────► [Cosa B]
         │
         └──── también ────► [Cosa C]
```

---

#### 7. CONSIDERACIONES FINALES

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 💡 CONSIDERACIONES FINALES │
└──────────────────────────────────────────────────────────────────────────────┘

## Antes de empezar cualquier cambio

[Lista de cosas a verificar o considerar]

"Siempre es buena idea:

- Revisar el business-data-map para entender el contexto...
- Identificar qué flujos podrían verse afectados...
- Verificar si hay procesos automáticos relacionados..."

## Recursos útiles

[Referencias a otros documentos o recursos del proyecto]

- `.context/business/business-data-map.md` - Para entender los flujos
- `.context/project-test-guide.md` - Para saber qué validar
- [Otros recursos relevantes]
```

---

## FASE 2: INTEGRACIÓN

### Actualizar System Prompt

Si no existe una sección de "Development Guide" en el system prompt, agregar:

```markdown
## Development Guide

See `.context/business/project-dev-guide.md` for orientation on:

- How the project is structured
- What to consider when working on each flow
- Dependencies between features
- Points of attention and gotchas

**Based on:** Business Data Map
```

---

## CHECKLIST FINAL

Antes de guardar, verificar:

- [ ] El tono es conversacional, como un compañero explicando
- [ ] NO hay snippets de código ni templates
- [ ] Cada flujo tiene su sección con consideraciones
- [ ] Los diagramas ASCII ayudan a visualizar relaciones
- [ ] Los puntos de atención son útiles y no obvios
- [ ] Referencia al business-data-map

---

## REPORTE FINAL

```markdown
# ✅ Development Guide Generado

## Archivo Creado:

`.context/business/project-dev-guide.md`

## Basado en:

`.context/business/business-data-map.md`

## Contenido:

- Estructura del proyecto explicada
- [N] flujos con consideraciones
- [N] máquinas de estado documentadas
- [N] procesos automáticos explicados
- [N] integraciones descritas
- Puntos de atención identificados
```

---

## FILOSOFÍA DE ESTE PROMPT

- **Conversacional:** Como si un compañero te explicara el proyecto
- **Orientativo:** QUÉ considerar, no CÓMO hacerlo
- **Visual:** Diagramas ASCII para explicar relaciones
- **Práctico:** Información útil para trabajar, no teoría
- **Asume experiencia:** El lector ya sabe desarrollar, solo necesita contexto
