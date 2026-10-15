"""Build a Whisper ``initial_prompt`` from the DNA glossaries.

Whisper treats ``initial_prompt`` as if it were the preceding transcript, so
seeding it with production vocabulary (shot and character names, VFX
shorthand) biases decoding toward those spellings instead of phonetic
near-misses. The same project/global glossaries already used as LLM note
context (see ``dna.glossary_config``) are the source.

Only the *terms* are sent, not the definitions: Whisper keeps just the last
~224 prompt tokens and truncates from the left, so a long definitional block
would push the most valuable terms off the front. Project terms go first
because they are the ones a general-purpose model cannot know.
"""

from __future__ import annotations

# Comfortably under Whisper's ~224-token prompt window even for name-heavy
# lists that tokenise at ~3 chars/token.
DEFAULT_MAX_PROMPT_CHARS = 600

# A "term" longer than this is almost certainly a sentence that happened to
# contain a colon, not a glossary key.
_MAX_TERM_CHARS = 60
# A line with no ``term: definition`` separator is treated as a bare term only
# when it is short enough to plausibly be one.
_MAX_BARE_LINE_CHARS = 40


def extract_glossary_terms(text: str) -> list[str]:
    """Pull the term side of each ``term: definition`` line.

    Blank lines and ``#`` comments are skipped. Short lines without a colon
    are kept whole (a bare list of names is a common way to fill the project
    glossary). Order is preserved; duplicates are dropped case-insensitively.
    """
    terms: list[str] = []
    seen: set[str] = set()
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(("-", "*")):
            line = line[1:].strip()
        if ":" in line:
            term = line.split(":", 1)[0].strip()
            if not term or len(term) > _MAX_TERM_CHARS:
                continue
        elif len(line) <= _MAX_BARE_LINE_CHARS:
            term = line
        else:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term)
    return terms


def build_initial_prompt(
    glossary_project: str,
    glossary_global: str = "",
    max_chars: int = DEFAULT_MAX_PROMPT_CHARS,
) -> tuple[str, int]:
    """Return ``(prompt, term_count)`` for Whisper's ``initial_prompt``.

    Project terms are added first, then global terms, until adding another
    would exceed ``max_chars``. Returns ``("", 0)`` when there is nothing to
    add so callers can simply omit the field.
    """
    candidates = extract_glossary_terms(glossary_project)
    seen = {t.lower() for t in candidates}
    for term in extract_glossary_terms(glossary_global):
        if term.lower() not in seen:
            seen.add(term.lower())
            candidates.append(term)

    if not candidates:
        return "", 0

    prefix = "Glossary: "
    included: list[str] = []
    length = len(prefix) + 1  # trailing period
    for term in candidates:
        extra = len(term) + (2 if included else 0)  # ", " separator
        if length + extra > max_chars:
            break
        included.append(term)
        length += extra

    if not included:
        return "", 0
    return f"{prefix}{', '.join(included)}.", len(included)
