/**
 * Spec 2026-09-29-limit-banktetel-kivetel (1. döntés): a lektor és a bank-ellenőr ugyanarra a banktételre többféle
 * útvonallal mutat (`experience.quiz[65]`, `experience.quiz.65`, `experience.quiz[65].options[2]`). A kapu egyetlen,
 * normalizált hivatkozással dolgozik.
 */
export type BankName = "quiz" | "methods" | "tasks";
export type BankItemRef = { bank: BankName; index: number };

const BANK_ITEM_PATH = /^experience\.(quiz|methods|tasks)(?:\[(\d+)\]|\.(\d+))(?:[.[].*)?$/;

/** A banktétel hivatkozása, vagy null, ha az útvonal nem egy konkrét banktételre mutat. */
export function bankItemRef(path: string | null | undefined): BankItemRef | null {
  if (typeof path !== "string") return null;
  const m = path.match(BANK_ITEM_PATH);
  if (!m) return null;
  const index = Number(m[2] ?? m[3]);
  return Number.isSafeInteger(index) ? { bank: m[1] as BankName, index } : null;
}

/** A normalizált (zárójeles) útvonal. */
export function bankItemPath(ref: BankItemRef): string {
  return `experience.${ref.bank}[${ref.index}]`;
}

/**
 * Spec 2026-09-29-limit-check-kivetel (1. döntés): a lecke egy blokkjára mutató útvonal (`sections[10].blocks[3]`,
 * `sections.10.blocks.3`, al-útvonallal is). Hogy a blokk `check`-e, a hívó dönti el a leckéből.
 */
export type CheckBlockRef = { section: number; block: number };

const SECTION_BLOCK_PATH = /^sections(?:\[(\d+)\]|\.(\d+))\.blocks(?:\[(\d+)\]|\.(\d+))(?:[.[].*)?$/;

export function checkBlockRef(path: string | null | undefined): CheckBlockRef | null {
  if (typeof path !== "string") return null;
  const m = path.match(SECTION_BLOCK_PATH);
  if (!m) return null;
  const section = Number(m[1] ?? m[2]);
  const block = Number(m[3] ?? m[4]);
  return Number.isSafeInteger(section) && Number.isSafeInteger(block) ? { section, block } : null;
}

export function checkBlockPath(ref: CheckBlockRef): string {
  return `sections[${ref.section}].blocks[${ref.block}]`;
}
