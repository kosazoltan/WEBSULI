import type { AIResponse } from "../ai/AIProvider";
import { crossFamilyFallback } from "../ai/models";
import { studioModelReady } from "../ai/studio-provider";

/**
 * Review #221: egy JSON-választ adó hívás egyszeri ellentétes családú tartalékkal. A tartalék-határon BELÜL csak a szolgáltatói
 * hívás és a válasz ellenőrzése (`check`) van; a felhasználás könyvelése (`book`, pl. `workflowUsage` → persist) KÍVÜL — a
 * könyvelési hiba (elveszett lease, DB-hiba) változatlanul továbbmegy, nem indít fölösleges, fizetős tartalékhívást. Az elutasított
 * elsődleges válasz felhasználása is könyvelődik (kifizetett).
 */
export async function chatJsonWithFallback<T>(opts: {
  primary: string;
  call: (model: string, fallback: boolean) => Promise<AIResponse>;
  book: (usage: AIResponse["usage"]) => Promise<void>;
  check: (response: AIResponse) => T;
  signal?: AbortSignal;
  ready?: (model: string) => boolean;
  onFallback?: (fallback: string, error: unknown) => void;
}): Promise<T> {
  let firstError: unknown;
  let response: AIResponse | undefined;
  try {
    response = await opts.call(opts.primary, false);
  } catch (error) {
    firstError = error;
  }
  if (response) {
    await opts.book(response.usage);
    try {
      return opts.check(response);
    } catch (error) {
      firstError = error;
    }
  }
  const fallback = crossFamilyFallback(opts.primary);
  if (opts.signal?.aborted || !fallback || !(opts.ready ?? studioModelReady)(fallback)) throw firstError;
  opts.onFallback?.(fallback, firstError);
  const second = await opts.call(fallback, true);
  await opts.book(second.usage);
  return opts.check(second);
}
