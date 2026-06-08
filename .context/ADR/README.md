# `.context/ADR/` — Architecture Decision Records

Durable log of **important architecture decisions** for this project. One file per decision. Append-only by intent: decisions are never deleted — they are **superseded** by newer ADRs that link back.

An ADR captures *why* a structural choice was made, the alternatives weighed, and the consequences accepted — so a future human or AI session does not re-litigate a settled decision or silently violate it.

## When to write an ADR

Write one whenever a decision is **architectural and hard to reverse**:

- A cross-cutting invariant (auth model, error model, data-access model, tenancy model).
- A choice that future features must conform to (every API route MUST do X).
- A trade-off with a rejected alternative worth remembering.
- A security or integrity boundary.

Do **not** write an ADR for: a single bug fix, a local refactor, a naming tweak, or anything a code comment covers. Those live in code, commits, or `engram` memory.

## Naming

```
ADR-<NNNN>-<kebab-title>.md      e.g. ADR-0001-unified-api-authentication.md
```

`<NNNN>` is a zero-padded incrementing integer. Never reuse a number. Never renumber.

## Status lifecycle

```
Proposed ──> Accepted ──> (later) Superseded by ADR-XXXX
                  │
                  └──────> Deprecated   (withdrawn, not replaced)
```

A superseded ADR stays in the folder; its header points forward to the ADR that replaced it.

## Template

Each ADR carries: `Status`, `Date`, `Context`, `Decision`, `Consequences`, `Alternatives considered`. Copy an existing ADR as the starting shape.

## Index

| ADR | Title | Status | Date |
| --- | ----- | ------ | ---- |
| [ADR-0001](./ADR-0001-unified-api-authentication.md) | Unified API authentication (single identity gateway) | Accepted | 2026-06-08 |
