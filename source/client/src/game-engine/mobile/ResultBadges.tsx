import type { Achievement } from "@/lib/achievements";

/**
 * S13 / B6 — a futás új jelvényei az eredménykártya egységes sorában (mind a 7 játékban ugyanígy), olvasható méretben
 * (≥ 14 px). A Szökőár S9-es `tsunami-new-badges` listájának közös változata; a jobb felső `AchievementToast` az
 * eredményképernyő alatt nem jelenik meg (`useResultScreenOpen`), így nem lóg a kártya gombjaira.
 */
export default function ResultBadges({ badges }: { badges: readonly Achievement[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="game-result-badges" data-testid="game-result-badges" aria-label={badges.length > 1 ? "Új jelvények" : "Új jelvény"}>
      {badges.map((a) => (
        <li
          key={a.id}
          className="game-result-badge"
          data-testid={`game-result-badge-${a.id}`}
          aria-label={`Új jelvény: ${a.title} (+${a.points} pont)`}
        >
          <span aria-hidden="true">{a.icon}</span>
          {/* Alacsony fekvő nézetben a felirat és a pont elmarad (index.css), csak az ikon + név látszik. */}
          <span aria-hidden="true">
            <span className="game-result-badge-label">Új jelvény: </span>
            <strong>{a.title}</strong>
            <span className="game-result-badge-points"> (+{a.points} pont)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
