import { z } from "zod";

export const triangleAreaLabParamsSchema = z.object({
  base: z.number().finite().min(0.1).max(1000),
  height: z.number().finite().min(0.1).max(1000),
  unit: z.enum(["cm", "m"]),
}).strict();
export type TriangleAreaLabParams = z.infer<typeof triangleAreaLabParamsSchema>;

/** One scale for both axes: drawn angles and the external altitude stay honest. */
export function triangleAreaScene(params: TriangleAreaLabParams, apexRatio: number, heightRatio: number) {
  const p = triangleAreaLabParamsSchema.parse(params);
  if (!Number.isFinite(apexRatio) || apexRatio < -0.4 || apexRatio > 1.4
    || !Number.isFinite(heightRatio) || heightRatio < 0.5 || heightRatio > 1.5) {
    throw new RangeError("A mozgatás a labor tartományán kívül esik.");
  }
  const scale = Math.min(300 / (1.8 * p.base), 170 / (1.5 * p.height));
  const left = (400 - p.base * scale) / 2;
  const bottom = 214;
  const x = left + p.base * scale * apexRatio;
  const height = p.height * heightRatio;
  return {
    a: { x: left, y: bottom }, b: { x: left + p.base * scale, y: bottom },
    c: { x, y: bottom - height * scale }, foot: { x, y: bottom },
    height, area: p.base * height / 2,
    external: apexRatio < 0 || apexRatio > 1,
  };
}

export function labNumber(value: number): string {
  return value.toLocaleString("hu-HU", { maximumFractionDigits: 3 });
}
