import { sourceImageParamsSchema, sourceImageSrc } from "@shared/source-image";

type AnimProps = { params: Record<string, unknown>; caption: string };

/**
 * D1H (docs/specs/2026-11-25-d1h-kivagott-kep.md): a forrás kivágott képe — alt-szöveggel, felirattal és forrásmegjelöléssel
 * (webes forrásnál kattintható, új lapon, `noopener noreferrer`). Hibás paraméter → nem jelenik meg (mint a többi ábrafajta).
 */
export function SourceImageAnim({ params, caption }: AnimProps) {
  const parsed = sourceImageParamsSchema.safeParse(params);
  if (!parsed.success) return null;
  const p = parsed.data;
  const credit = p.page ? `${p.credit}, ${p.page}. oldal` : p.credit;
  return (
    <figure className="lesson-source-image my-4" data-anim="sourceImage">
      <img src={sourceImageSrc(p.imageId)} alt={p.alt} loading="lazy" decoding="async" className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border" />
      <figcaption className="text-sm text-muted-foreground mt-2">
        {caption}
        <span className="block text-xs mt-1">Forrás:{" "}
          {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{credit}</a> : credit}
        </span>
      </figcaption>
    </figure>
  );
}
