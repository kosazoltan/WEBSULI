import { Brain, Compass, FlaskConical, Leaf, TrendingUp } from "lucide-react";
import type { DesignThemeId } from "@shared/lesson-design";

/** Az évfolyamsáv ikonja — a lecke-lejátszó fejléce és a főoldali kártya ugyanezt mutatja (spec 2026-11-03-fooldal-boritokartyak). */
export const BAND_ICON: Record<DesignThemeId, typeof Leaf> = { explorer: Leaf, adventure: Compass, studio: Brain, laboratory: FlaskConical, future: TrendingUp };
