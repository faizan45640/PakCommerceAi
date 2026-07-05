# PakCommerce AI — Git Workflow

This guide is for every team member. Follow it every time you work on the project.

## Main Rule

Do **not** work directly on `main` or `dev`.

Every task must be done on a separate feature branch.

Correct flow:

```text
dev → your feature branch → Pull Request → dev → main
```

---

## Branches

| Branch | Purpose | Who uses it |
|---|---|---|
| `main` | Stable final/demo-ready code | Protected branch |
| `dev` | Active team development branch | Everyone pulls from here |
| `feature/...` | Individual task branch | One member per task |
| `fix/...` | Bug fix branch | For fixes |
| `docs/...` | Documentation branch | For docs only |

---

## Daily Start Workflow

When you start work, always update your local code first.

```bash
git checkout dev
git pull origin dev
```

Now create your own branch.

```bash
git checkout -b feature/sXX-tXXX-short-task-name
```

Example:

```bash
git checkout -b feature/s02-t018-inventory-ui-amina
```

---

## Working on Your Task

Make changes only on your feature branch.

Check your current branch:

```bash
git branch
```

The branch with `*` is your current branch.

Save progress:

```bash
git add .
git commit -m "feat(scope): short description"
```

Example:

```bash
git commit -m "feat(inventory): add inventory table"
```

Push your branch:

```bash
git push -u origin feature/sXX-tXXX-short-task-name
```

After the first push, you can use:

```bash
git push
```

---

## Before Opening a Pull Request

Before creating a PR, update your branch with the latest `dev`.

```bash
git checkout dev
git pull origin dev

git checkout feature/sXX-tXXX-short-task-name
git merge dev
```

If there are conflicts and you are not sure what to do, stop and ask before editing randomly.

After conflicts are fixed, push again:

```bash
git push
```

---

## Pull Request Rule

Open a Pull Request from:

```text
your feature branch → dev
```

Do **not** open PRs directly to `main`.

PR title format:

```text
T-018: Add inventory table UI
```

PR description should include:

```markdown
## Task Info
Task ID:
Slice:
Owner:

## What Changed
-

## How I Tested
-

## Notes / Blockers
-
```

---

## After PR Is Merged

After your PR is merged into `dev`, update your local `dev`.

```bash
git checkout dev
git pull origin dev
```

Delete your old local branch:

```bash
git branch -d feature/sXX-tXXX-short-task-name
```

Now start the next task from fresh `dev`.

---

## If You Continue the Same Task Tomorrow

Do not create a new branch.

Use the same branch and update it with latest `dev`.

```bash
git checkout dev
git pull origin dev

git checkout feature/sXX-tXXX-short-task-name
git merge dev
```

Then continue working.

---

## Commit Message Format

Use this format:

```text
type(scope): short description
```

Examples:

```text
feat(products): add product table
feat(inventory): add stock update form
fix(orders): prevent negative stock
docs(readme): add setup steps
test(ai): add copilot tool test
chore(repo): add pull request template
```

Common types:

| Type | Meaning |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `test` | Tests |
| `chore` | Setup/config work |
| `refactor` | Code improvement without changing behavior |

---

## Branch Naming

Use this format:

```text
feature/sXX-tXXX-short-name-person
fix/tXXX-short-name-person
docs/topic-person
```

Examples:

```text
feature/s01-t004-product-list-amina
feature/s02-t018-inventory-api-talha
feature/s07-t064-whatsapp-ai-faizan
fix/t031-order-stock-deduction-talha
docs/setup-guide-monis
```

---

## Golden Rules

- Always pull latest `dev` before starting.
- Always create a new branch for a new task.
- Never code directly on `main`.
- Never code directly on `dev`.
- Commit small changes often.
- Push your work before ending the day.
- Open PRs only into `dev`.
- Do not commit `.env` files.
- Do not commit API keys or secrets.
- Do not merge your own PR unless the team has allowed it.
- If you get merge conflicts and are unsure, ask before fixing.

---

## Common Problems

### Problem: I accidentally worked on `dev`

Do this:

```bash
git checkout -b feature/recover-my-work
git push -u origin feature/recover-my-work
```

Then open a PR from this new branch to `dev`.

---

### Problem: Git says I have uncommitted changes before pulling

Commit your work first:

```bash
git add .
git commit -m "wip(scope): save progress"
```

Then pull latest `dev`.

---

### Problem: I forgot my branch name

Run:

```bash
git branch
```

The branch with `*` is your current branch.

---

### Problem: I want to check if my code is saved

Run:

```bash
git status
```

If it says:

```text
working tree clean
```

your current changes are committed.

---

## Final Simple Workflow

For a new task:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/sXX-tXXX-task-name

# work on task

git add .
git commit -m "feat(scope): description"
git push -u origin feature/sXX-tXXX-task-name

git checkout dev
git pull origin dev
git checkout feature/sXX-tXXX-task-name
git merge dev
git push
```

Then open PR:

```text
feature branch → dev
```
Rules:
Never commit to main.

Never commit to dev.

Always create a feature branch.

Always pull latest dev first.

Always open PR to dev.

One task = One branch.

One PR = One task.

Push before ending your day.