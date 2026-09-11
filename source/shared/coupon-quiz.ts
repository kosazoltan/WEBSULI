export type CouponQuizQuestion = {
  id: string; questionVersion: string; prompt: string; options: string[]; correctIndex: number;
  explanation: string | null; feedbackPerOption: string[]; topic: string | null;
  sourceMaterialId: string | null; tier: string;
};
export type CouponQuizAnswer = { pickedIndex: number; correct: boolean; bonusSeconds: number; answeredAt: string };
