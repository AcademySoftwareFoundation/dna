---
name: write-github-issues
description: Draft GitHub issues in markdown with type, summary, details, and acceptance criteria. Checks for duplicate issues and suggests repo labels. Use when creating or writing GitHub issues, drafting issue text, or when the user asks to file an issue.
---

# Write GitHub Issues

## Output

- **Always return the issue as markdown in the chat.** Do not create or write issue files unless the user approves (see below).
- **Include an issue title** (one line, for the GitHub issue title field).
- **Wrap the full issue in a copyable markdown code block** so the user can copy the entire body in one go. Put the title on its own line immediately before the block, or as the first line inside the block with a clear "Title:" or "## Title" so both title and body are obvious.
- **After user approval:** If the user says they approve, want to create it, or "go ahead and create it", create the issue via the GitHub CLI so it is opened in the repo. Use the same title and body (from the markdown block). Apply the suggested labels if the user did not specify otherwise. Tell the user the issue was created and give the issue number and link.

## Before Writing

### 1. Check for duplicates

- List open issues (e.g. `gh issue list --state open` or search on GitHub) for the same area or topic.
- If an existing issue clearly covers the same scope: **warn the user**, list those issues with links, and ask whether to continue or refine the new issue.
- Only draft the new issue after the user confirms or after confirming there are no duplicates.

### 2. Check repo labels

- List labels in the repo (e.g. `gh label list` or GitHub Labels page).
- In your response, suggest a **short list of labels** that fit the new issue (e.g. type, area like backend/frontend, priority, `good first issue`). If the repo has no labels yet, suggest a minimal set (e.g. `bug`, `feature`, `task`, `good first issue`).

## Issue type

Pick one and use it **only as a label** when creating the issue. Do not include a "Type" or "## Type" section in the issue body/description.

| Type       | Use when |
|-----------|----------|
| **bug**     | Something is wrong and should be fixed. |
| **feature** | New behavior or capability. |
| **task**    | Maintenance, refactor, docs, or research. |

**Decision flow:** Broken or incorrect behavior → bug. New capability or behavior → feature. Chores, docs, refactors, or research → task.

## Title format

- Start with a verb or a short area prefix when helpful (e.g. "Fix …", "Add …", "Docs: …").
- Keep the title to one clear sentence so it's scannable in issue lists.

## Content rules

- **Requirements-focused:** Describe what is needed or what is wrong, not step-by-step implementation. For **bugs**, it is OK (and helpful) to point to the file or area where the problem likely is.
- **No excess implementation detail:** Avoid prescribing exact code or architecture unless the user explicitly asks for it.

## Required sections

Every issue must include:

1. **Summary** – One or two sentences: what this issue is about.
2. **Details** – Context, current behavior (for bugs), desired behavior, or research question. Keep to what's needed to understand and scope the work.
3. **Acceptance criteria** – Checklist the implementer and reviewer can use. Must include issue-specific criteria plus the **standard acceptance criteria** (same for all issues).

### For bugs only: reproduction

Include:

- **Steps to reproduce** – Numbered steps that reliably trigger the bug.
- **Expected vs actual** – What should happen vs what actually happens.

### Out of scope

When it helps avoid scope creep, add an **Out of scope** or **Not in this issue** line listing what this issue explicitly does not cover.

### Standard acceptance criteria (same for all issues)

Every issue's acceptance criteria must include this exact checklist (in addition to any criteria specific to the issue):

- [ ] All changes tested locally
- [ ] All relevant automated tests complete successfully
- [ ] Verified no existing workflows broken
- [ ] For UI changes, screenshots or gif animations of the changes included
- [ ] Steps to test included in PR

## Good first issue

If the issue is labeled or marked as **Good first issue**, add this line (e.g. at the end of the issue body or in a "Note" block):

> We encourage contributors tackling this issue to explore the codebase and run the app without AI-assisted coding so you can learn how the system works.

## Issue template (structure)

Output **first** the issue title on its own line (for the GitHub title field), then the full body inside a **copyable markdown code block**. Use this structure:

**Title:** [One-line title, e.g. "Add Publish now button to note editor"]

Do **not** include "## Type" in the issue body; type is applied via labels only.

\`\`\`markdown
## Summary
[1–2 sentences]

## Details
[Context, current vs desired behavior, or research question. For bugs, optional: "Likely area: path/to/file or component X."]

[For bugs only:]
### Steps to reproduce
1. …
2. …

### Expected vs actual
- **Expected:** …
- **Actual:** …

## Acceptance criteria
- [ ] [Issue-specific criteria 1]
- [ ] [Issue-specific criteria 2]
- [ ] All changes tested locally
- [ ] All relevant automated tests complete successfully
- [ ] Verified no existing workflows broken
- [ ] For UI changes, screenshots or gif animations of the changes included
- [ ] Steps to test included in PR

## Out of scope
[Optional. What this issue does not cover.]

## Suggested labels
[Comma-separated list from repo labels, including area e.g. backend/frontend where relevant]
\`\`\`

## Creating the issue after approval

When the user approves the draft (e.g. "looks good", "create it", "go ahead"), create the issue and set labels in one flow. Do not stop after create; always apply labels immediately.

1. **Create:** Run `gh issue create --title "…" --body-file <file>` from the repo root. Use a temp file for the body (no "## Type" in the body). Capture the issue URL or number from the command output.
2. **Labels and type (right away):** Immediately run `gh issue edit <number> --add-label "label1","label2"` with the suggested labels. Include the type as a label (e.g. `bug`, `enhancement`, or `documentation`/`task` as the repo uses) plus area labels (e.g. `Frontend`, `Backend`). Use the exact suggested labels from the draft unless the user asked for different ones.
3. **Reply:** Tell the user the issue was created and give the issue number and link.

If `gh` is not available or a command fails (e.g. not authenticated), tell the user and provide the title and body again so they can create it manually.
