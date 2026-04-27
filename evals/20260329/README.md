# Promptfoo prompt evaluation

## Quick start

1. Set your API key (if using a cloud provider):

```bash
export OPENAI_API_KEY=sk-...
# Or for other providers:
# export ANTHROPIC_API_KEY=sk-ant-...
# export GOOGLE_API_KEY=...
```

2. Edit `promptfooconfig.yaml` to customize prompts, providers, and test cases.

3. Run the evaluation:

```bash
promptfoo eval
```

4. View results in your browser:

```bash
promptfoo view
```

## Learn more

- Configuration guide: https://promptfoo.dev/docs/configuration/guide
- All providers: https://promptfoo.dev/docs/providers
- Assertions & metrics: https://promptfoo.dev/docs/configuration/expected-outputs
- Examples: https://github.com/promptfoo/promptfoo/tree/main/examples
