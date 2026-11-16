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
        <li key={a.id} className="game-result-badge" data-testid={`game-result-badge-${a.id}`}>
          <span aria-hidden="true">{a.icon}</span>
          <span>
            Új jelvény: <strong>{a.title}</strong> (+{a.points} pont)
          </span>
        </li>
      ))}
    </ul>
  );
}
