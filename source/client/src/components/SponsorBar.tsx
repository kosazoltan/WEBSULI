import { SPONSORS } from "@shared/sponsors";

/**
 * Spec 2026-11-03-szponzor-fejlec: vékony, ízléses támogatói sáv a főoldal fejléce alatt — a logó a cég honlapjára visz, új lapon
 * (`rel="sponsored"`). Nincs animáció és külső szkript; a hover-emelés csak `prefers-reduced-motion: no-preference` mellett.
 */
export default function SponsorBar() {
  return (
    <aside className="sponsor-bar" aria-label="Támogatóink" data-testid="sponsor-bar">
      <span className="sponsor-bar-label">A tananyagkészítést támogatja</span>
      <div className="sponsor-bar-logos">
        {SPONSORS.map((s) => (
          <a
            key={s.id}
            className="sponsor-bar-link"
            href={s.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label={`${s.name} honlapja (új lapon nyílik)`}
            data-testid={`sponsor-${s.id}`}
          >
            <img src={s.logo} alt={s.name} width={s.width} height={s.height} loading="eager" decoding="async" />
          </a>
        ))}
      </div>
    </aside>
  );
}
