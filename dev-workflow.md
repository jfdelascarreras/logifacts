# Development workflow

## Phases and stages

---

### Preparation

#### 1 · Start from a clean base
Rebase from `main` before starting. Every new feature begins in sync with the current codebase.

---

### Design

#### 2 · Idea → design via brainstorm
Describe the idea (or bring a PRD) and validate feasibility before designing. Use brainstorming / grilling skills to turn the idea into a concrete design, resolving every decision in the tree.

#### 3 · Fast decisions, delegating to best practices
Answer the grilling short and decisively. When there is no strong preference, delegate the decision to domain best practices (UX, outreach, etc.) instead of blocking the flow.

---

### Planning

#### 4 · Written plan + validated data before building
The plan lives in a `.md` file (docs folder). If the feature touches the database, write the SQL queries and validate them against real data before moving forward, not after.

#### 5 · Plan review with a senior reviewer with fresh context, in rounds
A "head of engineering / CTO" agent with no construction context — strict and meticulous — reviews the plan. Iterate through multiple rounds until there are no remaining objections. Review time is not a constraint; thorough is the goal.

#### 6 · UI review on a mockup, before building
A designer agent (performance + interface guidelines) judges the UI on a mockup. New UI must reuse existing components and visual identity, not invent new styles.

---

### Build

#### 7 · Build with parallel agents and full context
Split the implementation across multiple agents (scale the number to the size of the work), each one holding the complete plan.

#### 8 · Run locally and test as a user
Start the real app (not just the test suite) and use it. Use run/verify skills, capture runtime evidence.

#### 9 · Iterate on real bugs with evidence
Report issues with screenshots and real observation (UX, copy, states that don't refresh), not in the abstract.

---

### Closing

#### 10 · Mandatory verification before declaring done
Type check, lint, and the relevant tests must pass. Nothing is reported as done without evidence that it passed.

#### 11 · A single PR, code only
One PR scoped to the change, no docs or tooling files. The author opens the PR; the agent can make a final commit (e.g. copy) once it's open.

#### 12 · Final functional review of the PR
Clean up the branch and run one last senior review, this time focused on whether the feature works end to end.

#### 13 · Close the loop in the tracker
Document what was done and move the issue to done in the ticket manager (Linear or equivalent).

---

## Agent profiles

These are not separate tools — they are role prompts invoked at specific stages in a **new conversation** to ensure fresh context. Same Claude, different lens.

### Product brainstormer
**Used at:** stages 2–3
**Purpose:** Turn a raw idea into a concrete, decision-complete design. Grill the idea hard, surface edge cases, force decisions on every open question.

```
Act as a senior product manager. I'll describe a feature idea.
Your job is to grill it: challenge assumptions, identify missing decisions,
and push until we have a concrete design with no open questions.
Start by asking the most important thing you need to know.
```

---

### CTO / senior plan reviewer
**Used at:** stage 5
**Purpose:** Review the written plan with zero construction context. Strict, meticulous, no mercy. Iterate until there are no remaining objections.

```
Act as a CTO doing a plan review. You have no context on how we got here —
only the plan in front of you. Be strict and meticulous.
Flag every assumption, missing edge case, or decision that isn't justified.
Do not approve until you have zero objections.
```

---

### Product designer
**Used at:** stage 6
**Purpose:** Review the UI mockup against the existing visual identity. Flag anything inconsistent, invented, or that doesn't reuse existing components.

```
Act as a senior product designer. Review this mockup for UI quality.
Your constraints: the new UI must reuse existing components and visual identity.
Flag anything that looks off, inconsistent, or that invents new patterns.
Be specific — reference the exact element and what's wrong with it.
```

---

### Engineer
**Used at:** stages 7–10
**Tool:** Claude Code (terminal), not claude.ai
**Purpose:** Implement the plan. Each engineer agent receives the full plan as context. Scale the number of parallel agents to the size of the work.

```
# In CLAUDE.md or at the start of each Claude Code session:
You are implementing a specific part of the plan in docs/features/[feature].md.
Read the full plan before writing any code.
Do not make decisions outside the scope of your assigned section.
```

---

### PR reviewer
**Used at:** stage 12
**Purpose:** Final end-to-end functional review. Fresh context, focused on whether the feature actually works — not whether the code looks good.

```
Act as a senior engineer doing a final PR review.
You have not seen the implementation process — only the PR diff and the original plan.
Verify that the feature works end to end as specified.
Flag anything that is missing, broken, or inconsistent with the plan.
```

---

### Key rule
**New conversation = fresh reviewer.** Stages 5, 6, and 12 must always start in a new conversation thread. An agent that has seen the reasoning behind a decision will defend it — a fresh agent will challenge it.
