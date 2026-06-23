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
