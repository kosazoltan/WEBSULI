/**
 * QR-kép egy linkhez (JM3a: a tanulói párosítás `PairQr`-jéből kiemelve; a párbaj meghívója is ezt használja).
 * A kép a böngészőben készül (`qrcode`, adat-URL) — hálózati hívás nincs. Új link → a régi kép és hibaállapot eltűnik;
 * hibánál szöveges tartalék (`fallback`).
 */
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";

export type QrImageProps = {
  link: string;
  alt: string;
  size?: number;
  fallback: ReactNode;
  className?: string;
  testId?: string;
};

export function QrImage({ link, alt, size = 240, fallback, className, testId }: QrImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    // Review #362: új link (pl. visszavonás után) → a régi kód és hibaállapot nem maradhat látható.
    setSrc(null);
    setError(false);
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: size, errorCorrectionLevel: "M" })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [link, size]);
  if (error) return <>{fallback}</>;
  return src ? (
    <img src={src} width={size} height={size} alt={alt} className={className ?? "rounded border bg-white p-1"} data-testid={testId} />
  ) : (
    <div className="animate-pulse rounded bg-muted" style={{ width: size, height: size }} />
  );
}
