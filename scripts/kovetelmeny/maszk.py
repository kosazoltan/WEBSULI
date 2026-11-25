"""Közös maszkolás a követelmény-adatbázishoz (gyujt.py és revizio.py): e-mail-cím (Unicode is), titok, Bearer-token,
felhasználói profilútvonal. Minden DB-be írt szöveg és napló ezen megy át."""
from __future__ import annotations

import os
import re
from pathlib import Path

# Unicode-tudatos cím: a helyi rész betű/szám (bármely írásrendszer) és ._%+-; a domain címkékből és ≥2 betűs TLD-ből áll.
EMAIL_RE = re.compile(r"([^\W_]|[.%+-])[\w.%+-]*@((?:[^\W_](?:[\w-]*[^\W_])?\.)+[^\W\d_]{2,})")
SECRET_SUBS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(?i)\b(Bearer|Basic|Token)(\s+)[A-Za-z0-9._~+/=:-]{8,}"), r"\1\2[TITOK]"),
    (re.compile(r"sk-(?:ant|or|proj)?[-_A-Za-z0-9]{20,}"), "[TITOK]"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"), "[TITOK]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{30,}"), "[TITOK]"),
    (re.compile(r"AIza[0-9A-Za-z_-]{30,}"), "[TITOK]"),
    (re.compile(r"\b(?:re|rnd|xai)_[A-Za-z0-9]{20,}"), "[TITOK]"),
    (re.compile(r"xai-[A-Za-z0-9]{20,}"), "[TITOK]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"), "[TITOK]"),  # JWT
    (re.compile(r"(?i)\b(postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?)://\S+"), r"\1://[TITOK]"),
    (re.compile(r"(?i)\b(api[_-]?key|secret|password|passwd|jelszó|token|authorization)(\s*[:=]\s*)['\"]?[^\s'\"]{6,}"),
     r"\1\2[TITOK]"),
]


def mask(text):
    """E-mail → első betű + ***@domain; titok → [TITOK]. Idempotens (a maszkolt alak nem illeszkedik újra)."""
    if not text or not isinstance(text, str):
        return text
    t = EMAIL_RE.sub(lambda m: f"{m.group(1)}***@{m.group(2)}", text)
    for r, rep in SECRET_SUBS:
        t = r.sub(rep, t)
    return t


def mask_obj(obj):
    """JSON-szerű szerkezet (dict/list/str) rekurzív maszkolása — az `extra` metaadathoz."""
    if isinstance(obj, str):
        return mask(obj)
    if isinstance(obj, dict):
        return {k: mask_obj(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [mask_obj(v) for v in obj]
    return obj


_HOME = str(Path.home())
_LOCAL = os.environ.get("LOCALAPPDATA") or ""
# a profilnév szóközt is tartalmazhat: a következő elválasztóig (\ vagy /) tart
_PROFILE_RE = re.compile(r"(?i)\b[A-Z]:[\\/]+Users[\\/]+[^\\/'\"\r\n]+|/(?:home|Users)/[^/'\"\r\n]+")


def safe(text) -> str:
    """Naplóba csak profilnév nélkül: a felhasználói könyvtár → ~, a LOCALAPPDATA → %LOCALAPPDATA%; utána maszkolás."""
    t = str(text)
    for src, rep in ((_LOCAL, "%LOCALAPPDATA%"), (_HOME, "~")):
        if src:
            for v in {src, src.replace("\\", "/"), src.replace("/", "\\")}:
                t = re.sub(re.escape(v), lambda _m, r=rep: r, t, flags=re.I)
    t = _PROFILE_RE.sub("~", t)
    return mask(t)
