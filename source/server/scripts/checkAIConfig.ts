/**
 * AI Konfiguráció Ellenőrző Script
 * 
 * Ez a script ellenőrzi, hogy az AI funkciókhoz szükséges
 * környezeti változók megfelelően be vannak-e állítva.
 * 
 * Futtatás: npx tsx server/scripts/checkAIConfig.ts
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env from source root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

console.log("🤖 AI Konfiguráció Ellenőrzése\n");
console.log("=".repeat(60));

// Required environment variables for AI functionality
const aiConfigVars = [
    {
        name: "AI_INTEGRATIONS_OPENAI_API_KEY",
        description: "OpenAI API kulcs (GPT-4 modellekhez)",
        provider: "OpenAI",
        required: true,
    },
    {
        name: "AI_INTEGRATIONS_OPENAI_BASE_URL",
        description: "OpenAI API base URL (opcionális, default: api.openai.com)",
        provider: "OpenAI",
        required: false, // Can use default
    },
    {
        name: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
        description: "Anthropic API kulcs (Claude modellekhez)",
        provider: "Claude",
        required: true,
    },
    {
        name: "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
        description: "Anthropic API base URL (opcionális, default: api.anthropic.com)",
        provider: "Claude",
        required: false, // Can use default
    },
];

let hasOpenAI = false;
let hasClaude = false;
let missingRequired: string[] = [];

console.log("\n📋 Környezeti változók állapota:\n");

for (const varConfig of aiConfigVars) {
    const value = process.env[varConfig.name];
    const isSet = !!value && value.length > 0;

    // Check if it's a valid API key (not just placeholder)
    const isValidKey = isSet && !value.includes("your_") && value.length > 10;

    const status = isValidKey ? "✅" : isSet ? "⚠️ (placeholder?)" : "❌";
    const prefix = varConfig.required ? "[KÖTELEZŐ]" : "[OPCIONÁLIS]";

    console.log(`${status} ${prefix} ${varConfig.name}`);
    console.log(`   Provider: ${varConfig.provider}`);
    console.log(`   Leírás: ${varConfig.description}`);

    if (isValidKey) {
        // Mask the key for security
        const masked = value.substring(0, 8) + "..." + value.substring(value.length - 4);
        console.log(`   Érték: ${masked}`);

        if (varConfig.provider === "OpenAI" && varConfig.name.includes("API_KEY")) {
            hasOpenAI = true;
        }
        if (varConfig.provider === "Claude" && varConfig.name.includes("API_KEY")) {
            hasClaude = true;
        }
    } else if (varConfig.required) {
        missingRequired.push(varConfig.name);
        console.log(`   Érték: ❌ NINCS BEÁLLÍTVA`);
    } else {
        console.log(`   Érték: (használja az alapértelmezett értéket)`);
    }
    console.log("");
}

console.log("=".repeat(60));
console.log("\n📊 Összefoglaló:\n");

// Provider availability
console.log("🔌 AI Providerek elérhetősége:");
console.log(`   OpenAI (GPT-4o):    ${hasOpenAI ? "✅ Konfigurálva" : "❌ Nem konfigurálva"}`);
console.log(`   Claude (Sonnet):    ${hasClaude ? "✅ Konfigurálva" : "❌ Nem konfigurálva"}`);

// Overall status
console.log("\n🎯 AI Funkciók státusza:");

if (hasOpenAI && hasClaude) {
    console.log("   ✅ Mindkét AI provider elérhető!");
    console.log("   ✅ A Fejlett Tananyag Készítő MŰKÖDŐKÉPES");
    console.log("   ✅ Fallback támogatás: Ha OpenAI sikertelen, Claude veszi át");
} else if (hasOpenAI || hasClaude) {
    const available = hasOpenAI ? "OpenAI" : "Claude";
    const missing = hasOpenAI ? "Claude" : "OpenAI";
    console.log(`   ⚠️  Csak ${available} elérhető`);
    console.log(`   ⚠️  ${missing} nincs konfigurálva`);
    console.log("   ⚠️  A Fejlett Tananyag Készítő KORLÁTOZOTT FUNKCIONALITÁSSAL működik");
    console.log("   ⚠️  Nincs fallback, ha a provider nem érhető el");
} else {
    console.log("   ❌ EGYIK AI PROVIDER SINCS KONFIGURÁLVA!");
    console.log("   ❌ A Fejlett Tananyag Készítő NEM FOG MŰKÖDNI");
}

// Missing required variables
if (missingRequired.length > 0) {
    console.log("\n⚠️  Hiányzó kötelező változók:");
    for (const varName of missingRequired) {
        console.log(`   - ${varName}`);
    }
    console.log("\n💡 A hiányzó változókat add hozzá a .env fájlhoz!");
}

// Model information
console.log("\n📦 Használt modellek:");
console.log("   OpenAI:  gpt-4o-2024-11-20");
console.log("   Claude:  claude-sonnet-4-20250514");

// Recommendations
console.log("\n💡 Ajánlások:");
if (!hasOpenAI) {
    console.log("   1. Szerezz OpenAI API kulcsot: https://platform.openai.com/api-keys");
    console.log("      Majd add hozzá: AI_INTEGRATIONS_OPENAI_API_KEY=sk-...");
}
if (!hasClaude) {
    console.log("   2. Szerezz Anthropic API kulcsot: https://console.anthropic.com/");
    console.log("      Majd add hozzá: AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...");
}

console.log("\n" + "=".repeat(60));
process.exit(missingRequired.length > 0 ? 1 : 0);
