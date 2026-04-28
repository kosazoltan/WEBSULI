import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioSettings, sfxClick } from "@/lib/audioEngine";

type Props = {
  /** Méret-variáns. Alap "sm" — a HUD-okhoz illeszkedik. */
  size?: "sm" | "icon";
  /** Extra tailwind osztályok (pl. szín-akcent). */
  className?: string;
  /** Megjelenítendő szöveg a mute-ikon mellett (alapból csak ikon). */
  showLabel?: boolean;
};

/**
 * Globális hang-mute toggle gomb. A `useAudioSettings()` hook-ból olvassa
 * az állapotot és minden ablakban szinkronizál (custom event-tel).
 *
 * Minden játék headerében / HUD-jában elhelyezhető — a localStorage-ben
 * tárolt mute-állapot az összes játékra érvényes ugyanabban a böngészőben.
 */
export default function AudioToggleButton({ size = "sm", className = "", showLabel = false }: Props) {
  const { muted, toggleMuted } = useAudioSettings();
  const Icon = muted ? VolumeX : Volume2;
  const handleClick = () => {
    if (muted) {
      // Hangot azonnal újra-bekapcsolva érdemes egy click-feedback-et adni,
      // hogy hallja a felhasználó: igen, működik.
      toggleMuted();
      sfxClick();
    } else {
      toggleMuted();
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "icon" ? "icon" : "sm"}
      className={`text-white/85 hover:bg-white/10 ${size === "icon" ? "h-8 w-8 p-0" : "px-2 h-8"} ${className}`}
      onClick={handleClick}
      aria-label={muted ? "Hang bekapcsolása" : "Hang némítása"}
      title={muted ? "Hang bekapcsolása" : "Hang némítása"}
      data-testid="audio-toggle"
    >
      <Icon className={`w-4 h-4 ${showLabel ? "mr-1" : ""}`} />
      {showLabel && <span className="text-xs">{muted ? "Néma" : "Hang"}</span>}
    </Button>
  );
}
