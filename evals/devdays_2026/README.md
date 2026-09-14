# DevDays 2026 — Prompt Evals

Welcome! This folder is for evaluating AI prompts for DNA's AI Notes Generation feature. DNA has the ability to generate AI notes. To do so, it needs a really great prompt asking it to act as a talented coordinator. Below are the instructions for how to participate in this LLM prompt-off, and how to utilize `promptfoo` to evaluate and submit your results. You'll need an LLM API key to participate!

## How it works

```
devdays_2026/
├── dataset/                  ← shared, do not edit
│   ├── transcripts/          ← review meeting transcripts (the inputs)
│   └── notes/                ← reference notes (the expected outputs)
├── example_001/              ← participant reference example
│   ├── prompts/              ← participant prompt files example
│   └── promptfooconfig.yaml  ← participant eval config example (to copy)
└── your_folder/              ← you create this
    ├── prompts/
    └── promptfooconfig.yaml
```

The `dataset/` folder is a made up example of transcripts and notes from a review session — everyone's prompts are tested against the same transcripts and reference notes. Your goal is to write a prompt that produces notes as close to the reference notes as possible, across all test cases.

---

## Setup

### 1. Install promptfoo

```bash
npm install -g promptfoo
```

**OR**

```bash
brew install promptfoo
```

### 2. Create your folder

Copy `example_001/` to a new folder and name it for your first initial and last name (e.g. `ptippett_001/`, `dmuren_002/`).

```bash
cp -r example_001/ ctarget_002/
```

Then copy `.env.example` to `.env` inside your new folder and fill in your provider and API key:

```bash
cp ctarget_002/.env.example ctarget_002/.env
```

Open `.env` and set `PROVIDER` to the model you're using and the matching API key. promptfoo loads this file automatically — no manual `export` needed.

### 3. Write your prompts

Edit the `.txt` files in your `prompts/` folder. You can have as many prompt variants as you like — each one becomes a column in the results table so you can compare them side by side. We recommend about three prompts at a time.

The prompts use [Nunjucks](https://mozilla.github.io/nunjucks/) templating. The variables available are:

| Variable | Description |
|---|---|
| `{{ transcript }}` | The raw review meeting transcript |
| `{{ context }}` | Shot metadata (shot ID, department, status, description) |
| `{{ notes }}` | Any existing notes for the shot (often empty) |

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
metadata:
  provider: &provider "${PROVIDER}"

providers:
  - *provider
```

`PROVIDER` comes from your `.env` file. The YAML anchor means that single value is automatically reused for generation and grading — you never need to touch the config. BYOLLM!

### `defaultTest`

This block applies to every test case. It has two kinds of assertions.

**`not-contains` checks** catch specific phrases that should never appear in production notes — things like "Let me know" or "Feel free to". These are literal string checks that fail immediately if the model outputs them. They represent real mistakes that have slipped through in production.

```yaml
- type: not-contains
  value: "Let me know"
```

**`llm-rubric`** uses a second LLM call to grade the output against a set of quality criteria. This is slower and costs more, but it catches subtler issues that a string match can't — like a note being too vague, or containing fabricated information.

```yaml
- type: llm-rubric
  value: |
    The output must satisfy all of the following:
    1. Notes are formatted as a bullet point list using "- " for each item
    ...
  provider: *provider
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
      provider: *provider
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

2. Create a .csv file of your your eval results (pass/fail counts per prompt variant) and include it in your folder.
  ```bash
  promptfoo eval --output example_001.csv
  ```

3. Check that you haven't modified anything outside your own folder. Only files inside `your_folder/` should be changed.

4. Push your branch and open a PR against `main`. Name your branch after your folder: `eval/example_002`.

5. Do not commit promptfoo cache or output files (`.promptfoo/`, `output/`). Add these to `.gitignore` if needed.

---

## Tips

- **Start with `example_001/` as your baseline.** Run it first to see what scores the reference prompts get, then try to beat them.
- **The `factuality` check is the most important.** A prompt that passes all string checks but fails factuality is not production-ready.
- **Shorter prompts often win.** The reference prompts (`notes_v1`, `v2`, `v3`) vary from 150 lines down to 22 lines — longer is not always better.
- **Check your `context` block.** The model uses shot metadata to understand what it's looking at. Providing accurate department and description helps.
