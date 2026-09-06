# Work order: Tornado Hunter control buttons still missing

```yaml
work_order:
  id: WO-2026-09-06-tornado-buttons-still-missing
  source:
    - owner: "Vezérlőgombok sincsenek."
    - prior: WO-2026-09-06-tornado-uncontrollable D1 (phone overlay on feat/tornado-mobile-controls @ 5a46005, NOT merged)
  defects:
    - id: D1
      area: Tornado Hunter on-screen controls (phone / Steam Deck / similar)
      observed: Owner reports control buttons are still absent after the D1 overlay work.
      expected: Drive buttons (Gáz / Fék / ◀ ▶ / ⚓ / Cam) visible during play on phone and similar devices, without requiring a merge-unaware production cache or a (pointer:coarse)-only CSS hide.
      repro_steps:
        - Open Tornado Hunter 200 play view on the device the owner is using
        - Look for on-screen drive buttons over/under the canvas
      evidence: owner free-text "Vezérlőgombok sincsenek."
      severity: P1
      acceptance: Buttons render in the play HUD for touch AND for devices that do not match (pointer: coarse); a test fails if the overlay is gated only on coarse:flex or sm:hidden; live/local evidence shows the buttons in the served play markup.
  open_questions: []
  measured_root_cause: |
    Two stacked hides, both measured 2026-09-06:
    1) Production (origin/main@e4ccc24) still has TouchControls root `sm:hidden`
       (TornadoHunter200.tsx:1835 on main). Feature commit 5a46005 is NOT merged.
    2) On the feature branch the overlay is `hidden coarse:flex`. Steam Deck,
       desktop, and hybrid pointers report (pointer:fine) → `hidden` wins and
       the bar never appears. Sibling games (SpaceAsteroidQuiz, TsunamiEscape,
       BlockCraft) always render on-screen buttons with no pointer media hide.
  out_of_scope:
    - New 3D models / coupon / quiz
    - Merge/push/deploy unless the owner asks after this visibility fix
```

