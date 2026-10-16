/** Vészfék az átállás idejére (docs/specs/2026-10-16-egy-futas.md, D): STUDIO_SINGLE_RUN=0 → a régi lépésgép; alapból az egyfutásos motor. */
export const singleRunEnabled = (env: NodeJS.ProcessEnv = process.env) => env.STUDIO_SINGLE_RUN !== "0";
