---
name: websuli-push-audit-hook
description: A WEBSULI push-hookja friss .audit-ok sentinelt kér (10 perc) a `git rev-parse --show-toplevel` gyökerében — worktree-ből a WORKTREE gyökerében
metadata:
  node_type: memory
  type: feedback
  modified: 2026-10-17T04:06:02.185Z
---

A `scripts/qa/hooks/check-audit-ok.mjs` PreToolUse-hook minden `git push`-t (a `push --delete`-et is) blokkol, ha a session
munkakönyvtárának repó-gyökerében lévő `.audit-ok` 10 percnél régebbi. A saját audit 2026-11-17 óta a `npm run gate:push`
(lint + tsc + teljes egységteszt + háromfázisú rend …; [[quality-gates-mandate]]) — csak zöld után írjuk a sentinelt, KÜLÖN
parancsban a push előtt (a hook a parancs ELŐTT fut, ugyanabban a parancsban írt sentinel nem számít). Mellette a
`check-quality-gates` hook a zöld `gate:push` bizonyítékot is nézi; a két hook független.

**Why:** a hook a session cwd-jéből `git rev-parse --show-toplevel`-lel oldja fel a gyökeret; worktree-ben ez a worktree
könyvtára (2026-10-17-én mérve: csak a `D:\repo\WEBSULI\.audit-ok` írása után a push blokkolva maradt). A tulajdonos a fő
repó útját kéri — worktree-ből mindkettőbe írjuk (a `.audit-ok` gitignore-olt).
A destruktív-parancs hook a `Get-Date -Format` szót „meghajtó formázásnak” veszi — ne átfogalmazással kerüljük meg, hanem hagyjuk el a fölösleges részt.

**How to apply:** push előtt: `npm run gate:push` → `Set-Content D:\repo\WEBSULI\.audit-ok ...` (+ worktree-ben `<worktree>\.audit-ok`) → külön hívásban `git push`.
PowerShellben a többsoros/idézőjeles commit-üzenetet fájlból adjuk (`git commit -F`), a `-m` idézőjelekkel elcsúszhat.
Kapcsolódó: [[api-keys-location]].
