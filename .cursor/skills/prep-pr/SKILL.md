---
name: prep-pr
description: Prepare a DNA branch for a pull request by checking frontend tests, backend tests, and DCO signoff in parallel subagents. Use when the user asks to prep a PR, prepare a pull request, check branch readiness, or verify tests and DCO signoff before opening or updating a pull request.
---

# Prep PR

Run the readiness checks below, then report whether the branch is ready. Do not edit code, commit, push, or open a pull request unless the user asks.

Commands match [CONTRIBUTING.md](../../../CONTRIBUTING.md) and the GitHub Actions workflows. Setup and layout are in [README.md](../../../README.md).

## Workflow

1. Confirm the git repo root. Run every command from that root, or from the directory named in the check.
2. Launch all three subagents in **one message**, in parallel. Use the Task tool with `subagent_type` `generalPurpose` and `run_in_background` false. Do not run these checks yourself in addition to the subagents.
3. Each subagent is check-only. It must not edit files, stage, commit, or push.
4. Wait for every subagent. Summarize with the report template. A branch is ready only when every check passes.

If a subagent fails to start, mark that check as not run and say why. Do not treat a missing result as a pass.

## Subagent: frontend tests

From `frontend/`:

```bash
npm run test-ci
```

Return pass/fail, the failing test names, and a short error excerpt. Do not start watch mode (`npm run test`).

## Subagent: backend tests

From `backend/`:

```bash
make test
```

`make test` runs pytest in Docker with coverage. Read the coverage total. **Fail the check when total coverage is below 90%**, which is what CI enforces with `--cov-fail-under=90` and what CONTRIBUTING.md requires.

Return pass/fail, coverage percent, failing test names, and a short error excerpt.

## Subagent: DCO signoff

Check commit messages only. Do not amend commits.

1. Base ref, first match that exists: `origin/main`, then `main`, then `origin/develop`.
2. `BASE=$(git merge-base HEAD "$BASE_REF")`
3. List commits with `git rev-list --reverse "$BASE"..HEAD`.
4. For each commit, require a trailer line matching:

```text
Signed-off-by: Name <email@example.com>
```

Use `git log -1 --format='%B' <sha>`. A valid line is `Signed-off-by:` followed by a name and an email in angle brackets.

5. Also run `git status --porcelain`. Uncommitted or unstaged work is not signed off until it is committed with `git commit -s`.

Return:

- base ref and commit count
- each commit missing or malformed `Signed-off-by` (short sha + subject)
- whether the worktree is dirty

Zero commits ahead of the base is a pass for committed history. Still report a dirty worktree.

## Report

```markdown
# PR prep

| Check | Result |
| --- | --- |
| Frontend tests | pass / fail / not run |
| Backend tests | pass / fail / not run (coverage %) |
| DCO signoff | pass / fail / not run |

**Ready:** yes / no

## Failures
- Check — what failed — command that fixes it

## Not committed
- Dirty files, if any. They need `git commit -s` before they have a DCO signoff.
```

Fix commands, offer only. Do not run them unless the user asks:

| Failure | Command |
| --- | --- |
| Tests | fix the failing tests, then re-run that suite |
| Missing DCO | new commits: `git commit -s`. Already pushed commits: do not amend or rebase unless the user asks |

After fixes, run this skill again. Re-run only the checks that failed when the user asks for a narrower rerun; otherwise run all three.
