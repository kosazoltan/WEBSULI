// agentic-qa-kit — dependency-cruiser alapkonfig (TECH-051)
// Telepítés után repo-specifikus réteg-szabályokkal bővítendő (lásd a kommenteket).
// Futtatás: npx depcruise src --config .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Körkörös függőség tilos — agentic entrópia elsődleges jele.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Árva modul (semmi nem hivatkozza) — valószínű AI-generált maradvány.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)\\.', '\\.(test|spec)\\.'] },
      to: {},
    },
    // Repo-specifikus réteg-szabályok IDE (példa):
    // {
    //   name: 'no-ui-to-db',
    //   severity: 'error',
    //   from: { path: '^src/(renderer|ui|frontend)' },
    //   to: { path: '^src/(db|database|prisma)' },
    // },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage|\\.next)(/|$)' },
    tsPreCompilationDeps: true,
  },
};
