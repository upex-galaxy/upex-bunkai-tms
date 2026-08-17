# Comments for BK-215

[View in Jira](https://jira.upexgalaxy.com/browse/BK-215)

---

### Ely - 7/11/2026, 12:52:26 PM

## PO Ratification — 2026-07-11

- C1 — Roles are ratified: viewers are read-only; members and above can write. Already reflected in the Business Rules field; no change needed.
- C3 — Message length is ratified at 1 to 4000 characters. Already reflected; no change needed.
- C4 — Chat history is retained indefinitely in v1; a workspace purge policy is deferred to a future iteration. Already reflected; no change needed.

---

### Ely - 7/30/2026, 1:29:45 PM

Mockup — Team Chat — workspace channel. Source: .context/designs/bunkai-test-management-tool/bk-210-team-chat/chat-panel-workspace.html · spec: master-design-plan §4.14



---

### pinto.lucas.nahuel - 8/15/2026, 4:29:29 AM

QA Refinements (Shift-Left Analysis) have been added to this story.

***Key Findings******:***

- No DB schema exists for channels, messages, or channel_members
- No chat API endpoints exist in the baseline
- Supabase Realtime is configured for broadcast, not chat
- Presence tracking system does not exist
- Message ordering under concurrent sends is undefined
- Pagination strategy for history is not defined

***Open Questions for PO/Dev******:***

1. General channel design (special case vs separate table)
2. Message ordering guarantee mechanism
3. Pagination strategy and page size
4. Validation layers (client-side vs server-side)
5. Maximum disconnection window
6. Empty state copy
7. Presence implementation approach
8. Role change propagation
9. Offline message behavior

***Next Steps******:***

- PO answers Critical Questions before sprint planning
- Dev answers Technical Questions before estimation
- DB schema design is confirmed and implemented
- API endpoint contracts are confirmed and implemented

See ATP DRAFT field for complete test outlines and traceability map.

---


_Synced from Jira by sync-jira-issues_
