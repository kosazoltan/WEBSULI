# Work order: Tornado Hunter cannot be steered

```yaml
work_order:
  id: WO-2026-09-06-tornado-uncontrollable
  source:
    - owner: "AStormhuntert nem lehet irányítani"
    - owner: "nincsenek vezérlőgombok a telefonos nézetben"
    - owner: "Steam Deck és hasonló: joystick teljesen működésképtelen. Fizika teljesen rossz."
  defects:
    - id: D1
      area: Tornado Hunter phone touch bar
      observed: Phone view has no control buttons (landscape ≥640px hid sm:hidden bar; canvas is touch-none).
      expected: Gáz / Fék / ◀ ▶ / ⚓ / Cam visible on coarse-pointer devices including landscape phones.
      severity: P1
      acceptance: TouchControls is canvas overlay, no sm:hidden/md:hidden; coarse:flex declared in tailwind screens.
    - id: D2
      area: Steam Deck / gamepad
      observed: Joystick does nothing. Repo has zero navigator.getGamepads / axes reads (measured).
      expected: Left stick drives (Y throttle, X steer); RT gas; LT brake; X/Square anchors; analog deadzone ~0.18.
      severity: P1
      acceptance: readStandardGamepad maps axes[0]/axes[1] through deadzone; play loop calls it; a unit test with stick right+forward increases heading and speed.
    - id: D3
      area: Drive physics
      observed: maxSpeed = fromKm(kmh/3600)*60 → 168 km/h vehicle is 10080 km/h in world units; steer gated at fromKm(0.02)=72 km/h.
      expected: 1 s at full throttle on a 168 km/h vehicle covers ~168/3600 km (±20%); steer works from ~2 km/h.
      severity: P1
      acceptance: drive.ts stepVehicle pins those numbers; page calls stepVehicle (not the *60 formula).
  root_cause: |
    D1: TouchControls was `sm:hidden` (width breakpoint). Landscape phones ≥640px hid the bar.
    D2: No Gamepad API. Steam Deck sticks are Standard Gamepad axes, not WASD.
    D3: Accel/maxSpeed multiplied by 60 as if dt were frames. Analog stick would also feel like a rocket if mapped onto that formula.
  open_questions: []
  out_of_scope:
    - New vehicle models
    - Coupon / quiz
    - Right-stick free camera orbit (left stick + triggers are the hole)
```
