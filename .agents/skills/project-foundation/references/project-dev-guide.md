# Development Guide

Generate a conversational guide that a senior teammate would give a new developer (human or AI) who is about to work on this project. It covers how the project is structured, what to consider when working on each flow, which features depend on which, and where the traps are.

The guide says WHAT to consider, never HOW to do it, and assumes the reader already knows how to program and only lacks this project's context. It reads like a colleague explaining the project, and it uses ASCII diagrams where they show a relationship or a flow better than prose. It has no code snippets, templates or specific commands.

**Prerequisite:** the data map (`business-data-context`) is generated: `bun run context:map business-data-context` prints sections, not the placeholder notice.

**Output:** `.context/business/project-dev-guide.md`

---

## Phase 0: Validation

### 0.1 Verify the business data map

```
Is the data map generated? (bun run context:map business-data-context)
  -> NO (it prints the placeholder notice): stop. Say that /project-context data has to run first.
  -> YES: continue
```

### 0.2 Understand the system

Read the data map (`bun run context:map business-data-context`) and understand:

- The entities and their business roles
- The main flows and how they connect
- The state machines and their transitions
- The automatic processes
- The external integrations

### 0.3 Explore the code structure

Identify:

- How the project is organized
- Where each kind of code lives
- The patterns already in use

---

## Phase 1: Generate the document

Write `.context/business/project-dev-guide.md` with the structure below. Keep the section order.

### Output structure

```markdown
# Development Guide: [Project Name]

╔══════════════════════════════════════════════════════════════════════════════╗
║                              DEVELOPMENT GUIDE                               ║
║                     "What you need to know to work here"                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

> This document assumes you have read the data map (`bun run context:map business-data-context`)
> to understand the business flows. Here I explain what to consider when you develop.
```

#### 1. Understanding the project

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ UNDERSTANDING THE PROJECT                                                    │
└──────────────────────────────────────────────────────────────────────────────┘

## How it is organized

[Conversational description of the project structure]

For example:
"The project follows the typical structure of [framework]. The important thing
is that business logic is separate from the API handlers, which makes it easier
to test and change without breaking other things..."

## Architecture diagram

[ASCII diagram showing how the parts connect]

    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Routes    │ ──► │  Services   │ ──► │  Database   │
    │  (API/UI)   │     │  (Logic)    │     │  (Supabase) │
    └─────────────┘     └─────────────┘     └─────────────┘
          │                   │
          │                   ▼
          │            ┌─────────────┐
          └──────────► │  External   │
                       │  Services   │
                       └─────────────┘

## The general data flow

[Conversational explanation of how data travels]

"When a user takes an action, the flow is usually..."
```

#### 2. Working with each flow

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ WORKING WITH EACH FLOW                                                       │
└──────────────────────────────────────────────────────────────────────────────┘

[For each main flow in the data map, explain conversationally what to keep in
mind when working on it]

---

## Flow: [Flow Name]

[Simplified ASCII diagram of the flow]

### Context

[What this flow does and why it matters]

"This flow is the heart of the system because..."

### What to keep in mind

[Important points, in a conversational tone]

"If you are going to change something here, remember that:

- This flow is connected to [other flows], so any change
  could affect them...

- The main entity has a state machine. The valid transitions
  are specific, so do not try to skip states...

- A trigger/webhook/cron depends on this. If you change the structure,
  make sure it keeps working..."

### Dependencies

[Diagram or list of what depends on what]

    This flow
         │
         ├──► affects → [Flow X]
         ├──► triggers → [Automatic process Y]
         └──► notifies → [Integration Z]

---

[Repeat for each important flow]
```

#### 3. The state machines

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ THE STATE MACHINES                                                           │
└──────────────────────────────────────────────────────────────────────────────┘

[For each entity with states, explain what to consider]

## [Entity with states]

[ASCII diagram of the state machine]

### Why it matters

"This state machine matters because it controls [what]. If you try an
invalid transition, [what happens]..."

### Things to remember

- "State [X] is terminal: there is no way out of it..."
- "When you move to [Y], [side effect] fires..."
- "Only [actor] can make the transition from [A] to [B]..."
```

#### 4. Automatic processes

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ AUTOMATIC PROCESSES                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

"The system has several processes that run on their own. You need to know
them because they can affect your work..."

## [Process 1: Trigger/Cron/Webhook]

### What it does and when

[Conversational explanation]

### Why it matters to you

"If you are working on [area], this process could [affect you this way]..."

### Process diagram

[ASCII diagram if it helps]

    Event                Process              Effect
       │                    │                   │
       ▼                    ▼                   ▼
    [trigger] ──────► [what it runs] ──────► [result]
```

#### 5. External integrations

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL INTEGRATIONS                                                        │
└──────────────────────────────────────────────────────────────────────────────┘

"The system connects to external services. Here is what each one does
and what to consider..."

## [External service]

### What it does in the system

[Conversational explanation]

### Touch points

[ASCII diagram showing where the system touches it]

### What to consider

"When you work on anything that involves [service], remember that:

- This service's webhooks arrive at [endpoint]...
- If the service fails, the system [behavior]...
- For local development, [consideration]..."
```

#### 6. Points of attention

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ POINTS OF ATTENTION                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

"After working on this project, these are the points that surprise people
or cause problems..."

## Things that could bite you

[Conversational list of gotchas and considerations]

- "**[Point 1]:** It looks like [X], but it is really [Y]..."

- "**[Point 2]:** Be careful with [situation] because [consequence]..."

- "**[Point 3]:** If you see [symptom], it is probably because [cause]..."

## Non-obvious dependencies

[ASCII diagram if it helps]

"Some connections are not obvious at first sight:"

    [Thing A] ──── secretly affects ────► [Thing B]
         │
         └──── also ────► [Thing C]
```

#### 7. Final considerations

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ FINAL CONSIDERATIONS                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

## Before you start any change

[List of things to verify or consider]

"It is always a good idea to:

- Review the data map to understand the context...
- Identify which flows could be affected...
- Check whether related automatic processes exist..."

## Useful resources

[References to other documents or resources of the project]

- `bun run context:map business-data-context` - to understand the flows
- [Other relevant resources]
```

---

## Phase 2: Integration

### Update the system prompt

If the system prompt has no "Development Guide" section, add:

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

## Final checklist

Before saving, verify:

- [ ] The tone is conversational, like a teammate explaining
- [ ] There are no code snippets or templates
- [ ] Each flow has its section with considerations
- [ ] The ASCII diagrams help visualize relationships
- [ ] The points of attention are useful and not obvious
- [ ] The guide refers to the data map (`business-data-context`)

---

## Final report

```markdown
# Development Guide Generated

## File created:

`.context/business/project-dev-guide.md`

## Based on:

The data map (`business-data-context`)

## Contents:

- Project structure explained
- [N] flows with considerations
- [N] state machines documented
- [N] automatic processes explained
- [N] integrations described
- Points of attention identified
```
