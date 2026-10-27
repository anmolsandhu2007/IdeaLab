import { z } from 'zod';

export const inputSchema = z.object({
  idea: z.string().trim().min(30, 'Describe your idea in at least 30 characters.').max(4000),
  customer: z.string().trim().max(300).default(''),
  geography: z.string().trim().max(150).default(''),
  businessModel: z.string().trim().max(300).default(''),
  sourceUrls: z.array(z.string().url().max(2000)).max(6).default([]),
});
export type IdeaInput = z.infer<typeof inputSchema>;

const findingSchema = z.object({
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(1800),
  kind: z.enum(['observed', 'interpretation', 'hypothesis']),
  sourceIds: z.array(z.string()).max(12),
});
export const reportSchema = z.object({
  headline: z.string().min(1).max(200),
  summary: findingSchema,
  competitors: z.array(z.object({
    name: z.string().min(1).max(120),
    relationship: z.enum(['direct', 'indirect', 'substitute']),
    positioning: z.string().max(1200),
    pricing: z.string().max(500),
    sourceIds: z.array(z.string()).min(1).max(12),
  })).max(8),
  painPoints: z.array(findingSchema).max(8),
  opportunities: z.array(findingSchema).max(8),
  risks: z.array(findingSchema).max(8),
  improvements: z.array(findingSchema).max(8),
  unknowns: z.array(z.string().max(600)).min(1).max(12),
});
export type Finding = z.infer<typeof findingSchema>;
export type ValidationReport = z.infer<typeof reportSchema>;
export type Source = {
  id: string; url: string; title: string; domain: string;
  retrievedAt: string; text: string; origin: 'submitted' | 'discovered';
};
export type Run = {
  id: string; title: string; status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string; progress: number; input: IdeaInput; sources: Source[];
  report: ValidationReport | null; warnings: string[]; error: string | null;
  createdAt: string; updatedAt: string;
};

export function validateReport(value: unknown, sources: Source[]): ValidationReport {
  const report = reportSchema.parse(value);
  const known = new Set(sources.map(s => s.id));
  const findings = [report.summary, ...report.painPoints, ...report.opportunities, ...report.risks, ...report.improvements];
  for (const item of [...findings, ...report.competitors]) {
    if (item.sourceIds.some(id => !known.has(id))) throw new Error('The model cited an unknown source.');
  }
  for (const item of findings) {
    if (item.kind === 'observed' && !item.sourceIds.length) throw new Error('An observed claim is missing its evidence.');
  }
  return report;
}
