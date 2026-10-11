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

Every change goes through three stages, each in a separate agent. The coordinator is the session that takes the owner's request and spawns the stage agents. The owner is the repository owner, who merges.

1. **Investigate** (read-only). Read the issue and its comments, the code the change touches, and the data it needs. Map every field the ticket or design shows to its API field. A missing field is a question before building.
2. **Implement.** Build on the agent's own branch and worktree. Verify on the real surface with the `verify-procurely` skill. Open the PR against `main`. Don't stack PRs on other PR branches. Commit messages, the PR title and the PR body follow the pstack Opening-a-PR playbook.
3. **Review.** A fresh agent that did not write the change reads the diff against the issue. It runs the `pstack:deslop` and `pstack:no-comments` skills, plus `pstack:interrogate` when the design is contested. It does not fix. It returns findings. A fresh implement agent applies the accepted ones, and a fresh reviewer re-checks. The reviewer posts its verdict as a PR comment whose first line is `Review verdict: PASS` or `Review verdict: CHANGES NEEDED`.

Only a PASS verdict sends a PR to the owner for merge.

Agents use other pstack skills as the task calls for them. Invoke skills through the Skill tool by name (`pstack:deslop`), not as slash commands, which only a person can type. The `pstack:*` skills come from the pstack Claude Code plugin. If it isn't installed, follow the same stages and say in the PR which skills couldn't run.
