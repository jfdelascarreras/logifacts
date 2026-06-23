# 1. The Goal Template (Core Wrapper for Everything)

**Usage:** Swap `{your task}` for any new feature, refactor, or project. Use as the wrapper for the other prompts. Emphasizes end-to-end execution, real testing, reviews, and production standards. Don’t hardcode progress paths — let the model choose sensible locations.

---

## Prompt

```
goal: {your task / the full spec you already agreed on}. keep going until the architecture and result meet the bar, not just until it runs.

after every meaningful step: real-time test the real thing (full end-to-end, plus computer use, browser, keystrokes, whatever it needs), auto review then commit, write progress somewhere sensible in the project.

finish: one dedicated review pass over everything.

done = every dimension at 100%, production-grade, a real user can walk in and use it.
```
