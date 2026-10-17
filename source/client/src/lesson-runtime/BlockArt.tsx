import { createContext, useContext, useState, type ReactNode } from "react";
import { DESIGN_ASSET_CATALOG } from "@shared/design-asset-catalog";
import { blockMarker, blockMascot, sectionDivider } from "@shared/block-art";
import type { DesignAsset } from "@shared/design-assets";
import type { DesignBand } from "@shared/subject-icons";

/**
 * Arculati bank S2–S3 (docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md): blokkjelző, fejezetdísz, kabalapóz a lejátszóban.
 * A sávot a lejátszó gyökere adja (kontextus). A kép az adatbázis-végpontról jön; hibánál a katalógus statikus fájlja; ha az
 * sem, a régi megjelenés (lucide ikon / semmi) marad — sosem törött kép.
 */
export const DesignBandContext = createContext<DesignBand | null>(null);
export const useDesignBand = () => useContext(DesignBandContext);

function BankImage({ asset, size, fallback = null, className }: { asset: DesignAsset; size: number; fallback?: ReactNode; className?: string }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  if (stage === 2) return <>{fallback}</>;
  return <img src={stage === 0 ? `/api/design-assets/${asset.id}` : asset.src} alt="" aria-hidden="true" width={size} height={size} decoding="async" loading="lazy"
    className={className} data-bank={asset.kind} onError={() => setStage(s => (s === 0 ? 1 : 2))} />;
}

/** A blokkfejléc ikonja: a sáv blokkjelzője, ha van; különben a régi lucide ikon. */
export function BlockMarker({ kind, fallback }: { kind: string; fallback: ReactNode }) {
  const band = useDesignBand();
  const asset = band ? blockMarker(kind, band, DESIGN_ASSET_CATALOG) : undefined;
  // Review #279: a hibaállapot a képhez kötött (key) — új kép esetén a betöltési lánc elölről indul.
  return asset ? <BankImage key={asset.id} asset={asset} size={22} fallback={fallback} className="ws-block-marker" /> : <>{fallback}</>;
}

/** Fejezetdísz a második fejezettől (a fejezetek között). */
export function SectionDivider({ index }: { index: number }) {
  const band = useDesignBand();
  const asset = band && index > 0 ? sectionDivider(band, index, DESIGN_ASSET_CATALOG) : undefined;
  return asset ? <div className="ws-divider" role="presentation"><BankImage key={asset.id} asset={asset} size={40} /></div> : null;
}

/** Az 1–5. évfolyamon a fejezet első blokkjának típusához illő kabalapóz a fejezetcím mellett. */
export function SectionMascot({ firstKind }: { firstKind: string | undefined }) {
  const band = useDesignBand();
  const asset = band && firstKind ? blockMascot(firstKind, band, DESIGN_ASSET_CATALOG) : undefined;
  return asset ? <span className="ws-section-mascot"><BankImage key={asset.id} asset={asset} size={64} /></span> : null;
}
