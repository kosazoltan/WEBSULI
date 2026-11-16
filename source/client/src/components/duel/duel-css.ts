/**
 * A párbaj megjelenítő komponenseinek stílusa (JM1r: az aréna `DUEL_CSS`-éből, egy játékos nézőpontjára nagyítva).
 * A közös `index.css`-t nem érinti; a lap egyszer, egy `<style>`-ban teszi ki (`<DuelStyles />`).
 * Színtokenek: `--seat` (saját: cián), a rivális chip: magenta. Csökkentett mozgásnál nincs animáció, statikus jelzés marad.
 */
export const DUEL_VIEW_CSS = `
.duel-hud { --seat: #22d3ee; position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.duel-hud--rival { --seat: #e879f9; padding: 4px 8px; border-radius: 12px; background: #0f172acc; border: 1px solid color-mix(in srgb, var(--seat) 45%, transparent); }
.duel-hud[data-status="away"], .duel-hud[data-status="left"] { opacity: .6; }
.duel-hud-head { display: flex; align-items: center; gap: 8px; min-height: 22px; min-width: 0; }
.duel-hud-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; color: var(--seat); }
.duel-hud--self .duel-hud-name { font-size: 17px; }
.duel-hud--rival .duel-hud-name { font-size: 14px; }
.duel-hud-grade { font-size: 13px; font-weight: 700; color: #cbd5e1; }
.duel-hud-badge { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 900; letter-spacing: .04em;
  vertical-align: 2px; color: #0b1020; background: #fde68a; }
.duel-hud-streak { flex: none; padding: 2px 8px; border-radius: 9999px; font-size: 13px; font-weight: 900; color: #fde68a; background: #f59e0b26; border: 1px solid #f59e0b55; }
.duel-hud-dot { flex: none; width: 12px; height: 12px; border-radius: 9999px; background: #334155; border: 2px solid #64748b; }
.duel-hud-dot[data-on="true"] { background: #4ade80; border-color: #bbf7d0; box-shadow: 0 0 8px #22c55e; }
.duel-hud-status { flex: none; font-size: 12px; font-weight: 800; color: #fcd34d; }
.duel-hud-hp { flex: none; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
.duel-hud--self .duel-hud-hp { font-size: 17px; }
.duel-hud--rival .duel-hud-hp { font-size: 14px; }
.duel-hp { position: relative; height: 12px; border-radius: 9999px; background: #1e293b; border: 1px solid #ffffff26; overflow: hidden; }
.duel-hud--rival .duel-hp { height: 7px; }
.duel-hp-fill { height: 100%; border-radius: inherit; transition: width .45s cubic-bezier(.2,.9,.3,1.2); }
.duel-hp-fill--ok { background: linear-gradient(90deg, #22c55e, #a3e635); }
.duel-hp-fill--mid { background: linear-gradient(90deg, #eab308, #facc15); }
.duel-hp-fill--low { background: linear-gradient(90deg, #f97316, #fb923c); }
/* A csapás száma a panel közepén lebben fel (1,3 s), utána eltűnik — nem takarja tartósan az ítéletet. */
.duel-dmg { position: absolute; left: 50%; top: 100%; z-index: 6; font-size: clamp(30px, 9vmin, 48px); font-weight: 900; color: #fdba74;
  text-shadow: 0 0 18px #f97316, 0 3px 8px #000; animation: duel-float 1.3s ease-out forwards; pointer-events: none; white-space: nowrap; }
.duel-hud--rival .duel-dmg { font-size: 22px; top: 60%; }
.duel-combo { color: #fde047; font-size: clamp(22px, 7vmin, 34px); text-shadow: 0 0 18px #f59e0b, 0 3px 8px #000; }
@keyframes duel-float { 0% { transform: translate(-50%, 10px) scale(.6); opacity: 0; } 18% { transform: translate(-50%, 0) scale(1.2); opacity: 1; }
  70% { opacity: 1; } 100% { transform: translate(-50%, -36px) scale(1); opacity: 0; } }

.duel-timer { height: 6px; border-radius: 9999px; background: #ffffff14; overflow: hidden; flex: none; }
.duel-timer-fill { height: 100%; width: 100%; transform-origin: left center; background: #22d3ee; }
.duel-timer-fill[data-low="true"] { background: #fbbf24; }

.duel-qcard { --pfs: 22px; --ofs: 19px; --omin: 72px; --opad: 8px 10px; --ogap: 10px; --plh: 1.25;
  position: relative; display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 0; min-width: 0; }
@media (max-height: 700px) { .duel-qcard { --pfs: 20px; --ofs: 18px; --omin: 64px; } }
.duel-qcard[data-fit="1"] { --pfs: 18px; --ofs: 16px; --omin: 60px; }
.duel-qcard[data-fit="2"] { --pfs: 16px; --ofs: 15px; --omin: 56px; --ogap: 8px; }
.duel-qcard[data-fit="3"] { --pfs: 15px; --ofs: 14px; --omin: 52px; --opad: 6px 8px; --ogap: 6px; --plh: 1.2; }
.duel-qcard[data-fit="4"] { --pfs: 14px; --ofs: 13px; --omin: 48px; --opad: 4px 6px; --ogap: 6px; --plh: 1.15; }
.duel-qcard[data-fit="5"] { --pfs: 12px; --ofs: 12px; --omin: 48px; --opad: 2px 4px; --ogap: 4px; --plh: 1.1; }
.duel-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: safe center; overflow: hidden; }
.duel-q { display: flex; flex-direction: column; gap: var(--ogap); min-height: 0; }
.duel-q > * { flex-shrink: 0; }
.duel-prompt { font-size: var(--pfs); font-weight: 800; line-height: var(--plh); color: #f8fafc; text-align: center; overflow-wrap: anywhere; }
.duel-options { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ogap); }
.duel-option { --seat: #22d3ee; min-height: var(--omin); padding: var(--opad); border-radius: 16px; font-size: var(--ofs); font-weight: 800; line-height: 1.15; color: #fff;
  background: linear-gradient(180deg, #1e2b4d, #16203b); border: 2px solid #ffffff2e; overflow-wrap: anywhere; touch-action: manipulation;
  transition: transform .08s ease-out, background-color .15s; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.duel-option[data-pressed="true"] { transform: scale(.96); background: color-mix(in srgb, var(--seat) 35%, #16203b); border-color: var(--seat); }
.duel-option[data-state="chosen"] { background: color-mix(in srgb, var(--seat) 40%, #16203b); border-color: var(--seat); }
.duel-option[data-state="correct"] { background: #15803d; border-color: #86efac; box-shadow: 0 0 16px #22c55e88; }
.duel-option[data-state="wrong"] { background: #1e2b4d; border: 3px solid #fb923c; }
.duel-option:disabled { cursor: default; }
.duel-option:disabled[data-state="idle"] { opacity: .8; }
.duel-qcard[data-state="reveal"] .duel-option { min-height: 48px; }
.duel-qcard[data-state="reveal"] .duel-prompt { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.duel-locked { text-align: center; font-size: 15px; font-weight: 800; color: #a5f3fc; }
.duel-verdict { padding: 8px 12px; border-radius: 14px; text-align: center; }
.duel-verdict--ok { background: #14532d99; border: 1px solid #22c55e88; }
.duel-verdict--miss { background: #431407aa; border: 1px solid #fb923c88; }
.duel-verdict-title { font-size: 16px; font-weight: 900; color: #fff; }
.duel-verdict-note { margin-top: 2px; font-size: 14px; font-weight: 800; color: #fde68a; }
.duel-verdict-why { margin-top: 2px; font-size: 14px; line-height: 1.3; color: #e2e8f0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.duel-card { --seat: #22d3ee; padding: 10px 12px; border-radius: 18px; background: #0f172ae6; border: 2px solid color-mix(in srgb, var(--seat) 50%, transparent); min-width: 0; }
.duel-card--rival { --seat: #e879f9; }
.duel-card--win { border-color: #facc15; box-shadow: 0 0 28px #facc1555; }
.duel-card--compact { padding: 6px 10px; }
.duel-card-head { display: flex; align-items: center; gap: 10px; }
.duel-medal { font-size: 34px; line-height: 1; }
.duel-card--compact .duel-medal { font-size: 24px; }
.duel-card--win .duel-medal { animation: duel-pop .6s ease-out 1; }
.duel-card-name { font-size: 19px; font-weight: 900; color: var(--seat); overflow-wrap: anywhere; }
.duel-card--compact .duel-card-name { font-size: 16px; }
.duel-card-place { font-size: 13px; font-weight: 700; color: #cbd5e1; }
.duel-card-praise { margin: 6px 0; font-size: 15px; font-weight: 800; color: #fef3c7; }
.duel-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
.duel-card--compact .duel-card-stats { grid-template-columns: 1fr; }
.duel-card-stats dt { font-size: 12px; font-weight: 700; color: #94a3b8; }
.duel-card-stats dd { font-size: 17px; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
@keyframes duel-pop { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .duel-dmg, .duel-card--win .duel-medal { animation: none !important; }
  .duel-dmg { opacity: 1; transform: none; top: 0; left: auto; right: 8px; font-size: 16px; text-shadow: 0 2px 6px #000; }
  .duel-hp-fill, .duel-option { transition: none; }
}
`;
