/**
 * AI konfiguráció-ellenőrző.
 *
 * Futtatás: npx tsx server/scripts/checkAIConfig.ts
 *
 * Miért íródott újra (2026-09-04): az előző változat saját listát tartott a
 * providerekről és a modellekről, ezért elavult — nem tudott az OpenRouterről és a
 * Studio hét lépéséről, és zöldet mutatott olyan konfigurációra, amelyben a Tudás-térkép
 * kinyerés nem tud elindulni. Egy diagnosztika, ami hamis megnyugtatást ad, rosszabb a
 * semminél.
 *
 * Most mindent a `server/ai/models.ts`-ből olvas, tehát nem tud kettéválni a valóságtól:
 * ha oda új lépés vagy új feladat kerül, ez a kimenet magától követi.
 *
 * A kulcsok ÉRTÉKÉT soha nem írja ki, csak azt, hogy be van-e állítva.
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const {
  AI_KEY_NAMES,
  LEGACY_MODELS,
  STUDIO_STEPS,
  aiKeyStatus,
  assertDistinctFamilies,
  modelFamily,
  resolveLegacyModel,
  studioModelMap,
} = await import("../ai/models");

type LegacyTask = keyof typeof LEGACY_MODELS;

/** Magyar nevek a jelentéshez — a kulcshiány önmagában semmit nem mond a tulajdonosnak. */
const FEATURE_LABELS: Record<string, string> = {
  htmlFix: "HTML-hibajavítás (admin)",
  htmlTheme: "Téma-átírás (admin)",
  htmlFixStream: "SSE HTML-javítás (Fejlett Készítő)",
  claudeChat: "Claude beszélgetés (Fejlett Készítő)",
  claudeHtml: "Claude HTML-generálás (Fejlett Készítő)",
  analyzeFiles: "Feltöltött fájlok elemzése (vision)",
  chatgptChat: "ChatGPT beszélgetés (Fejlett Készítő)",
  improve: "Tananyag-okosítás",
  quizGenerator: "Kvíz-generálás tananyagból",
  studioExtract: "Tudás-térkép kinyerés (Stúdió)",
  studioPipeline: "Lecke-csővezeték (Stúdió)",
};

const label = (id: string) => FEATURE_LABELS[id] ?? id;

console.log("🤖 AI konfiguráció\n");
console.log("=".repeat(64));

const status = aiKeyStatus();

console.log("\n📋 API kulcsok (csak jelenlét, érték soha):\n");
for (const [vendor, info] of Object.entries(status)) {
  const mark = info.configured ? "✅" : "❌";
  console.log(`   ${mark} ${vendor.padEnd(11)} ${info.envVar}`);
  if (!info.configured && info.blockedFeatures.length > 0) {
    console.log(`      └─ emiatt NEM működik: ${info.blockedFeatures.map(label).join(", ")}`);
  }
}

console.log("\n📦 Admin AI-funkciók → modell → szükséges kulcs:\n");
for (const task of Object.keys(LEGACY_MODELS) as LegacyTask[]) {
  const value: string | readonly string[] = LEGACY_MODELS[task];
  const model = Array.isArray(value)
    ? `${resolveLegacyModel(task)} (tartalék: ${value.slice(1).join(", ")})`
    : resolveLegacyModel(task);
  console.log(`   ${label(task).padEnd(38)} ${model}`);
}

console.log("\n🎓 Lesson Studio lépések → modell:\n");
const studio = studioModelMap();
for (const step of STUDIO_STEPS) {
  console.log(`   ${step.padEnd(14)} ${studio[step].padEnd(26)} (${modelFamily(studio[step])})`);
}

console.log("\n🔒 D1 független lektorálás:");
try {
  assertDistinctFamilies();
  console.log(`   ✅ a Szerző (${modelFamily(studio.author)}) és a Lektor (${modelFamily(studio.lektor)}) más családból van`);
} catch (error) {
  console.log(`   ❌ ${(error as Error).message}`);
}

const blocked = Object.values(status)
  .filter((s) => !s.configured)
  .flatMap((s) => s.blockedFeatures);

console.log("\n" + "=".repeat(64));
if (blocked.length === 0) {
  console.log("\n✅ Minden AI-funkcióhoz megvan a kulcs.\n");
  process.exit(0);
}

console.log(`\n⚠️  ${blocked.length} funkció nem működik hiányzó kulcs miatt:\n`);
for (const feature of blocked) console.log(`   - ${label(feature)}`);

console.log("\n💡 Beállítás:");
for (const [vendor, info] of Object.entries(status)) {
  if (info.configured) continue;
  const where =
    vendor === "openai"
      ? "https://platform.openai.com/api-keys"
      : vendor === "anthropic"
        ? "https://console.anthropic.com/settings/keys"
        : "https://openrouter.ai/keys";
  console.log(`   ${info.envVar}=…   (${where})`);
}
console.log(
  `\n   Éles rendszeren a Render dashboard → websuli-api-eu → Environment.` +
    `\n   Fontos: a Render env-var kollekciós PUT MINDENT felülír — kulcsonként add hozzá.\n`,
);

// Exit code 1: a CI/telepítés utáni ellenőrzés így észreveszi a hiányt.
process.exit(1);
