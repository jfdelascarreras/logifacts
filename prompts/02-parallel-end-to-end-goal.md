# 2. Parallel + End-to-End Goal (For Big Tasks)

**Usage:** Large plans — split into independent pieces, parallel agents, synthesize, validate E2E, finish with review and summary.

---

## Prompt

```
For this task, write yourself a new end-to-end /goal: complete the whole plan, not just the next step, until the architecture, implementation, tests, review, and final result meet the standard. Split that goal into independent pieces, spawn as many parallel agents as needed to do it better and faster, and give each agent its own dedicated /goal that includes its expected deliverable, verification, and completion standard.

Dispatch them concurrently, keep tracking progress in the right place, synthesize results as they return, resolve conflicts, continue implementation, run real-time validation after important steps, and finish with review, submission/commit when appropriate, and a final summary. Validation should cover the real end-to-end path, including browser/computer use, clicks, keyboard actions, and any necessary operation. Do not stop after partial progress unless blocked by missing credentials, destructive ambiguity, or conflicting requirements.
```
