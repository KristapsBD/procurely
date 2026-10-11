# Procurely

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `KristapsBD/procurely` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Working agreements

### Questions

Collect open questions and ask them together at a decision point, not one at a time. Give every question a recommended default and say what choosing differently would change. Keep working on everything the questions do not block.

Ask only what the code, the issue, or a quick experiment cannot settle. Never invent missing data, such as a field the API lacks. Treat it as a question.

### Change flow

Every change goes through three stages. The coordinator spawns a separate agent for each.

1. **Investigate** (read-only). Read the issue and its comments, the code the change touches, and the data it needs. Map every field the ticket or design shows to its API field. A missing field is a question before building.
2. **Implement.** Build on the agent's own branch and worktree. Verify on the real surface with the `verify-procurely` skill. Open the PR against `main`.
3. **Review.** A fresh agent that did not write the change reads the diff against the issue. It runs the `pstack:deslop` and `pstack:no-comments` skills, plus `pstack:interrogate` when the design is contested. It fixes what it finds or returns findings, then posts its verdict as a PR comment.

A PR goes to the owner for merge only after the review verdict is posted.

Agents use other pstack skills as the task calls for them. Invoke skills through the Skill tool by name (`pstack:deslop`), not as slash commands, which only a person can type.
