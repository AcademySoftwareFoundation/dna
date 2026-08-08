"""Python source shipped into RV via remote-pyeval.

remote-pyeval only evaluates a single expression, so multi-line defs are
wrapped in exec(..., globals()) and the resulting functions are then called
by name in follow-up evals.

Findings this rides on (validated against RV 2025.1.0):
- SG version metadata lives in `<source>.tracking.info`, a flat key/value
  string array; key "id" is the Version ID. `tracking.infoStatus` must be
  "good" (value carries leading whitespace).
- In review-app/Screening Room layouts every version is a clip in one
  sequence, so version switches are frame changes — hence the frame-changed
  binding with a sourcesAtFrame() dedupe.
- remoteSendEvent delivers EVENT messages to non-RV network clients.
"""

DNA_EVENT_NAME = "dna-view-changed"

STATE_DEFS = r'''
exec("""
import json

def dna_state():
    from rv import commands as rvc
    out = {"viewNode": rvc.viewNode(), "frame": rvc.frame(), "sources": []}
    for s in rvc.sourcesAtFrame(rvc.frame()):
        entry = {"source": s}
        try:
            entry["media"] = rvc.getStringProperty(s + ".media.movie")
        except Exception:
            entry["media"] = []
        try:
            status = rvc.getStringProperty(s + ".tracking.infoStatus")
            entry["infoStatus"] = status[0].strip() if status else ""
        except Exception:
            entry["infoStatus"] = ""
        try:
            entry["trackingInfo"] = rvc.getStringProperty(s + ".tracking.info")
        except Exception:
            entry["trackingInfo"] = []
        out["sources"].append(entry)
    return json.dumps(out)

_dna_last_key = [None]

def dna_push_now():
    from rv import commands as rvc
    try:
        rvc.remoteSendEvent(
            "%(event)s", "*", dna_state(), rvc.remoteConnections()
        )
    except Exception as exc:
        print("dna_push error: %%r" %% exc)

def dna_push(event):
    dna_push_now()
    event.reject()

def dna_frame_changed(event):
    from rv import commands as rvc
    try:
        key = ",".join(rvc.sourcesAtFrame(rvc.frame()))
    except Exception:
        key = ""
    if key != _dna_last_key[0]:
        _dna_last_key[0] = key
        dna_push_now()
    event.reject()

def dna_install_bindings():
    from rv import commands as rvc
    if globals().get("_dna_bound"):
        return "already bound"
    globals()["_dna_bound"] = True
    rvc.bind("default", "global", "frame-changed", dna_frame_changed,
             "DNA in-review sync")
    for ev in ("after-graph-view-change", "source-media-set"):
        rvc.bind("default", "global", ev, dna_push, "DNA in-review sync")
    return "bindings installed"
""", globals())
''' % {"event": DNA_EVENT_NAME}


def parse_tracking_info(pairs: list[str]) -> dict[str, str]:
    """tracking.info is a flat [key, value, key, value, ...] string array."""
    return dict(zip(pairs[::2], pairs[1::2]))
