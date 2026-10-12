"""Rewrite the DNA extension manifest for a Firefox (AMO) build.

The source manifest serves Chrome and Firefox (unpacked) at once. For the
Firefox package, drop the keys and permissions Firefox doesn't support so AMO
validation stays clean. Transcription is Chrome-only, so its Meet content
script goes too; tab sync uses the page bridge instead of externally_connectable.

Usage: python3 scripts/firefox_extension_manifest.py <manifest.json>
"""

import json
import sys

CHROME_ONLY_PERMISSIONS = {"offscreen", "tabCapture"}


def main(path: str) -> None:
    with open(path) as f:
        manifest = json.load(f)

    manifest["background"].pop("service_worker", None)
    manifest.pop("externally_connectable", None)
    manifest.pop("content_scripts", None)
    manifest["permissions"] = [
        p for p in manifest["permissions"] if p not in CHROME_ONLY_PERMISSIONS
    ]

    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])
