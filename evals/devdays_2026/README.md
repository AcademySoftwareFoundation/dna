# DevDays 2026 — Prompt Evals

This folder is for evaluating AI prompts for DNA's Notes Generation feature. Each participant creates their own numbered folder (e.g. `ptippett_001/`, `dmuren_002/`) containing their prompt variants and a config file that runs them against the shared dataset.

## How it works

```
devdays_2026/
├── dataset/                  ← shared, do not edit
│   ├── transcripts/          ← review meeting transcripts (the inputs)
│   └── notes/                ← reference notes (the expected outputs)
├── example_001/              ← reference example
│   ├── prompts/              ← your prompt files go here
│   └── promptfooconfig.yaml  ← your eval config
└── your_folder/              ← you create this
    ├── prompts/
    └── promptfooconfig.yaml
```

The `dataset/` folder is the ground truth — everyone's prompts are tested against the same transcripts and reference notes. Your goal is to write a prompt that produces notes as close to the references as possible, across all test cases.

---

## Setup

### 1. Install promptfoo

```bash
npm install -g promptfoo
```

You'll also need an Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### 2. Create your folder

Copy `example_001/` to a new folder with the next available number:

```bash
cp -r example_001/ example_002/
```

### 3. Write your prompts

Edit the `.txt` files in your `prompts/` folder. You can have as many prompt variants as you like — each one becomes a column in the results table so you can compare them side by side.

The prompts use [Nunjucks](https://mozilla.github.io/nunjucks/) templating. The variables available are:

| Variable | Description |
|---|---|
| `{{ transcript }}` | The raw review meeting transcript |
| `{{ context }}` | Shot metadata (shot ID, department, status, description) |
| `{{ notes }}` | Any existing notes for the shot (usually empty) |

### 4. Run the eval

From inside your folder:

```bash
cd example_002/
promptfoo eval
```

To open the results in a browser:

```bash
promptfoo eval --view
```

---

## Understanding the config

Open `promptfooconfig.yaml`. Here's what each section does and why it's set up that way.

### `prompts`

```yaml
prompts:
  - file://prompts/notes_v1.txt
  - file://prompts/notes_v2.txt
  - file://prompts/notes_v3.txt
```

Each file is a separate prompt variant. Promptfoo runs every prompt against every test case, so you get a full comparison matrix. Add, remove, or rename these files freely.

### `providers`

```yaml
providers:
  - "anthropic:messages:claude-opus-4-6"
```

This is the model your prompts are evaluated against. It matches the model DNA uses in production, so results are representative. You can add more providers here to compare models, but keep Opus as the primary.

### `defaultTest`

This block applies to every test case. It has two kinds of assertions.

**`not-contains` checks** catch specific phrases that should never appear in production notes — things like "Let me know" or "Feel free to". These are literal string checks that fail immediately if the model outputs them. They represent real mistakes that have slipped through in production.

```yaml
- type: not-contains
  value: "Let me know"
```

**`llm-rubric`** uses a second Claude call to grade the output against a set of quality criteria. This is slower and costs more, but it catches subtler issues that a string match can't — like a note being too vague, or containing fabricated information.

```yaml
- type: llm-rubric
  value: |
    The output must satisfy all of the following:
    1. Notes are formatted as a bullet point list using "- " for each item
    ...
  provider: "anthropic:messages:claude-opus-4-6"
```

The rubric criteria map directly to DNA's production standards for notes — bullet format, specific and actionable, no soft requests, no meta-commentary, no fabrication, no emojis.

### `tests`

Each test case represents one shot from the shared dataset. The paths use `../dataset/` to point up out of your folder into the shared folder — don't change these paths.

```yaml
- description: "TST_010_0010 — Comp, blown-out sky and desert dust"
  vars:
    transcript: file://../dataset/transcripts/TST_010_0010.txt
    context: |
      Version: TST_010_0010_TD
      Shot: TST_010_0010
      ...
  assert:
    - type: factuality
      value: file://../dataset/notes/TST_010_0010_ref.txt
      provider: "anthropic:messages:claude-opus-4-6"
    - type: contains-all
      value:
        - "sky"
        - "flare"
```

**`factuality`** compares your output against the reference note file using an LLM judge. It checks whether the key facts from the reference are present in the output — it's fuzzy, not exact, so slightly different wording is fine as long as the substance is right.

**`contains-all`** is a fast, cheap check that specific key terms from the reference appear in the output. These are chosen to be the single most important word or phrase from each shot — if your prompt produces a note that doesn't mention the lens flare for `TST_010_0010`, something has gone wrong.

---

## Submitting a pull request

1. Make sure your eval runs without errors:
   ```bash
   promptfoo eval
   ```

2. Check that you haven't modified anything outside your own folder. Only files inside `your_folder/` should be changed.

3. Push your branch and open a PR against `main`. Name your branch after your folder: `eval/example_002`.

4. In the PR description, paste a screenshot or summary of your eval results (pass/fail counts per prompt variant). The results table from `promptfoo eval --view` is ideal.

5. Do not commit promptfoo cache or output files (`.promptfoo/`, `output/`). Add these to `.gitignore` if needed.

---

## Tips

- **Start with `example_001/` as your baseline.** Run it first to see what scores the reference prompts get, then try to beat them.
- **The `factuality` check is the most important.** A prompt that passes all string checks but fails factuality is not production-ready.
- **Shorter prompts often win.** The reference prompts (`notes_v1`, `v2`, `v3`) vary from 150 lines down to 22 lines — longer is not always better.
- **Check your `context` block.** The model uses shot metadata to understand what it's looking at. Providing accurate department and description helps grounding.
- **A blank output is valid** when the transcript contains no actionable feedback. Don't force your prompt to produce notes when there's nothing to say.
