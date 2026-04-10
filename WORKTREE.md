# WEBSULI Repó Fa-nézet (WORKTREE.md)

> Generálva: 2026-04-10 | Tartalmazza az új memória rendszert

```
WEBSULI/
│
├── 📁 memory/                          ← ÚJ: 3-szintű memória rendszer
│   ├── 📁 procedural/
│   │   ├── 📁 deploy/                  (15 fájl - deployment eljárások)
│   │   │   ├── deploy-check-deployment.md
│   │   │   ├── deploy-database-recovery.md
│   │   │   ├── deploy-now.md
│   │   │   ├── deploy-vps-guide.md
│   │   │   ├── github-actions-fix.md
│   │   │   ├── github-ssh-key-guide.md
│   │   │   ├── github-ssh-key-fix.md
│   │   │   ├── ssh-key-info.md
│   │   │   ├── vercel-render-deploy.md
│   │   │   ├── vps-deploy-fix.md
│   │   │   ├── github-actions-setup.md
│   │   │   ├── google-auth-setup.md
│   │   │   ├── readme-hostinger.md
│   │   │   ├── readme-vps.md
│   │   │   └── ssh-setup.md
│   │   └── 📁 development/             (3 fájl - fejlesztési eljárások)
│   │       ├── code-analysis-report.md
│   │       ├── code-review-2024-12.md
│   │       └── readme-local.md
│   ├── 📁 semantic/
│   │   ├── 📁 infrastructure/          (11 fájl - infra tudás)
│   │   │   ├── github-secrets-info.md
│   │   │   ├── hostinger-api-setup.md
│   │   │   ├── hostinger-api-token.md
│   │   │   ├── hostinger-vps-list.md
│   │   │   ├── mcp-config.md
│   │   │   ├── mcp-status.md
│   │   │   ├── ssh-connection-summary.md
│   │   │   ├── vps-config.md
│   │   │   ├── vps-ips-summary.md
│   │   │   ├── websuli-vps-info.md
│   │   │   └── readme-cloudflare.md
│   │   └── 📁 technology/              (5 fájl - tech tudás)
│   │       ├── design-implementation-plan.md
│   │       ├── landing-performance-analysis.md
│   │       ├── material-improvement-feature.md
│   │       ├── material-improver-plan.md
│   │       └── edu-platform-design-2026.md
│   ├── 📁 episodic/
│   │   └── 📁 2026/                    (6 fájl - esemény naplók)
│   │       ├── deployment-status-snapshot.md
│   │       ├── vps-deployment-check-2026.md
│   │       ├── vps-deployment-diagnosis.md
│   │       ├── vps-diagnosis-result.md
│   │       ├── vps-project-analysis.md
│   │       └── session-dev-log.md
│   ├── 📁 projects/
│   │   └── 📁 websuli/                 (2 fájl - projekt szintű)
│   │       ├── project-overview.md
│   │       └── readme-download.md
│   └── 📁 indexes/
│       └── index.yml                  ← Collection routing config
│
├── 📁 vault/                           ← ÚJ: Hosszú távú kanonikus tudás
│   ├── 📁 infrastructure/
│   │   ├── hostinger-vps-canonical.md
│   │   ├── github-secrets-canonical.md
│   │   └── ssh-canonical.md
│   ├── 📁 development/
│   │   ├── material-improver-canonical.md
│   │   ├── design-system-2026-canonical.md
│   │   └── performance-optimization-canonical.md
│   └── MOC.md                         ← Map of Content
│
├── 📁 shared/                          ← ÚJ: Séma fájl
│   └── memory-schema-v2.yaml
│
├── WORKTREE.md                         ← ÚJ: Ez a fájl
│
├── 📁 source/                          ← Fő alkalmazás kód
│   ├── 📁 client/
│   │   ├── 📁 src/
│   │   │   ├── 📁 components/          (31+ fájl, incl. ui/ 47 fájl)
│   │   │   │   ├── MaterialImprover.tsx
│   │   │   │   ├── MaterialImprovementBackups.tsx
│   │   │   │   ├── LikeButton.tsx
│   │   │   │   ├── HeroSection.tsx
│   │   │   │   ├── ScientificBackground.tsx
│   │   │   │   ├── UserFileList.tsx
│   │   │   │   └── 📁 ui/              (47 shadcn/ui komponens)
│   │   │   ├── 📁 pages/               (8 fájl: home, admin, stb.)
│   │   │   ├── 📁 hooks/               (4 fájl, incl. useClassroomTheme.ts)
│   │   │   └── 📁 lib/                 (6 fájl)
│   │   └── index.html
│   ├── 📁 server/
│   │   ├── index.ts
│   │   ├── routes.ts                   (fő API, 5000+ sor)
│   │   ├── storage.ts                  (DB műveletek)
│   │   ├── auth.ts
│   │   ├── migrate.ts                  (DB migráció runner)
│   │   ├── improveAsync.ts             (AI job kezelő)
│   │   ├── 📁 ai/                      (5 fájl: AIProviderFactory, AICache)
│   │   ├── 📁 scripts/                 (10 fájl: diagnózis scriptek)
│   │   └── 📁 utils/                   (3 fájl)
│   ├── 📁 shared/
│   │   └── schema.ts                   (Drizzle séma)
│   ├── 📁 deploy/
│   │   ├── deploy-to-vps.sh
│   │   ├── ecosystem.config.cjs
│   │   ├── setup_ubuntu.sh
│   │   └── nginx.conf.example
│   ├── 📁 migrations/
│   │   └── 0001_add_material_improvement_tables.sql
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   ├── vercel.json
│   ├── CODE_ANALYSIS_REPORT.md
│   ├── CODE_REVIEW_2024_12.md
│   ├── GITHUB-ACTIONS-SETUP.md
│   ├── GOOGLE_AUTH_SETUP.md
│   ├── README-CLOUDFLARE.md
│   ├── README-DOWNLOAD.md
│   ├── README-HOSTINGER.md
│   ├── README-LOCAL.md
│   ├── README-VPS.md
│   └── SSH-SETUP.md
│
├── 📁 .github/
│   └── 📁 workflows/
│       └── deploy.yml
│
├── CHECK-DEPLOYMENT.md
├── DATABASE-RECOVERY.md
├── DEPLOY-NOW.md
├── DEPLOY-VPS.md
├── DEPLOYMENT-STATUS.md
├── DESIGN-IMPLEMENTATION-PLAN.md
├── GITHUB-ACTIONS-DEPLOYMENT-FIX.md
├── GITHUB-SECRETS-INFO.md
├── GITHUB-SECRETS-SSH-KEY-EXPLAINED.md
├── GITHUB-SECRETS-SSH-KEY-FIX.md
├── HOSTINGER-API-SETUP.md
├── HOSTINGER-API-TOKEN-SETUP.md
├── HOSTINGER-VPS-LIST.md
├── LANDING_PAGE_PERFORMANCE_ANALYSIS.md
├── MATERIAL_IMPROVEMENT_FEATURE.md
├── MATERIAL_IMPROVER_PLAN.md
├── MCP-CONFIG-FIXED.md
├── MCP-READY.md
├── MCP-SETUP-COMPLETE.md
├── SSH-CONNECTION-SUMMARY.md
├── SSH-KEY-INFO.md
├── VERCEL_RENDER_TELEPITES.md
├── VPS-CONFIG.md
├── VPS-DEPLOY-FIX.md
├── VPS-DEPLOYMENT-CHECK.md
├── VPS-DEPLOYMENT-DIAGNOSIS.md
├── VPS-DIAGNOSIS-RESULT.md
├── VPS-IPS-SUMMARY.md
├── VPS-PROJECT-ANALYSIS.md
├── WEBSULI-VPS-INFO.md
├── edu-platform-design-prompt-2026.md
└── session.md
```

## Memória rendszer összefoglaló

| Szint | Könyvtár | Fájlok | Leírás |
|-------|---------|--------|--------|
| Index | `memory/indexes/` | 1 | Collection routing |
| Episodic | `memory/episodic/2026/` | 6 | Időhöz kötött események |
| Semantic | `memory/semantic/infrastructure/` | 11 | Infra tudás |
| Semantic | `memory/semantic/technology/` | 5 | Tech tudás |
| Procedural | `memory/procedural/deploy/` | 15 | Deploy eljárások |
| Procedural | `memory/procedural/development/` | 3 | Dev eljárások |
| Projects | `memory/projects/websuli/` | 2 | Projekt szintű |
| Vault | `vault/infrastructure/` | 3 | Kanonikus infra |
| Vault | `vault/development/` | 3 | Kanonikus dev tudás |
| MOC | `vault/MOC.md` | 1 | Map of Content |
| Schema | `shared/memory-schema-v2.yaml` | 1 | Séma definíció |

**Összesen: 51 új fájl, 42 forrás MD fájl lefedve**
