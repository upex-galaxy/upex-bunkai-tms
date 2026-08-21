# BK-572 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-572)

A QA Lead administers a Workspace where a contractor finished their engagement last Friday. Their access should have ended with it. He opens the Workspace members screen and finds the contractor's row next to everyone else's, with a ***Remove*** action beside the invite controls he already knows.

He does not find that action everywhere. On his own row there is nothing to remove — leaving a Workspace is its own act, on its own screen, and this one is for acting on other people. And when one of his Admins opens the same screen, the Owner rows carry no Remove action at all: not a greyed one that explains itself after the click, simply nothing, because an Admin does not outrank an Owner and the interface says so before anything is attempted.

He chooses Remove on the contractor's row. A confirmation opens naming that person and nobody else, and it tells him the two things he would otherwise find out later and badly: the Personal Access Tokens that contractor holds for this Workspace will stop working, and the Bugs currently assigned to them will become unassigned. Nothing has happened yet.

He confirms. The membership ends, the Workspace-scoped Personal Access Tokens stop being accepted, the Bugs the contractor held go back to the unassigned pile with a record of who used to hold each one, and the Workspace Activity Stream gains an entry naming him as the person who did it and the moment he did. All of that is one act. Had any part of it failed, none of it would have happened, and he would have been told the removal failed with the contractor still a member, still holding working Personal Access Tokens, still holding their Bugs.

The contractor's own access ends where it should and stops there. Their other client's Workspace, where they are still working, is untouched — same membership, same role, same Bugs, and the Personal Access Token that serves that Workspace still works. Everything they authored here stays theirs: the ATCs they wrote still name them, the Runs they recorded still name them, and their name still renders in the Activity Stream entries they generated months ago. Removal ended their access; it did not edit the past.

Two removals will not go through, and both refusals are deliberate. If the contractor had been the Workspace's last remaining Owner, the removal would be refused rather than leave the Workspace ownerless. And if he had somehow aimed the action at himself, it would be refused too, pointing him at leaving instead.

The same rules hold for the autonomous agent his team runs against the API with an admin-scoped Personal Access Token. It gets the same ladder, the same refusals, and a refusal that reveals nothing: asking to remove someone who was never a member and asking about a Workspace the agent cannot see look exactly alike from the outside, so neither question can be used to discover whether a Workspace or a person exists. And an agent that skips the endpoint and goes at the membership records directly finds the same refusals waiting there — the rule lives in the data, not only in the door.

Later the contractor is hired back. There is no undo to press; he simply invites them again, picks their role at invite time, and they accept. They come back as a new joiner — the original tenure is not restored, and the Personal Access Tokens revoked when they left stay revoked, so they issue fresh Personal Access Tokens. That is the reversal, and it is the only one.

---
_Synced from Jira by sync-jira-issues_
