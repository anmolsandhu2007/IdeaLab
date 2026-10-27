import type { Run } from './schema';

// Deliberately fictional fixture. Never inserted into live research history.
export const sampleRun: Run = {
  id: 'sample', title: 'A research workspace for independent founders',
  status: 'completed', stage: 'Illustrative report', progress: 100,
  createdAt: '2026-10-27T09:00:00Z', updatedAt: '2026-10-27T09:00:00Z',
  input: { idea: 'A workspace that helps independent founders collect customer interviews, organize pain points, and connect product decisions to customer evidence.', customer: 'Independent founders', geography: 'Global', businessModel: 'Subscription', sourceUrls: [] },
  error: null,
  warnings: ['This is a fictional sample, not live research. Company names, source excerpts, and findings were written to demonstrate the report format.'],
  sources: [
    { id: 'S1', title: 'Fictional competitor product page', domain: 'example.com', url: 'https://example.com/fixture/product', retrievedAt: '', origin: 'submitted', text: 'ILLUSTRATIVE FIXTURE. Fieldnote Example offers interview transcripts, searchable notes, and tagging for small product teams. The fictional product page does not specify pricing.' },
    { id: 'S2', title: 'Fictional customer discussion', domain: 'example.com', url: 'https://example.com/fixture/discussion', retrievedAt: '', origin: 'submitted', text: 'ILLUSTRATIVE FIXTURE. A fictional founder writes: I keep interviews in documents and decisions in a spreadsheet. I lose the link between what people said and what I decided to build. A second fictional participant says that organizing notes is easier than deciding which complaints matter.' },
    { id: 'S3', title: 'Fictional substitute workflow', domain: 'example.com', url: 'https://example.com/fixture/workflow', retrievedAt: '', origin: 'submitted', text: 'ILLUSTRATIVE FIXTURE. A spreadsheet template called Interview Board Example has columns for interview date, customer segment, notes, themes, and next experiment. It is presented as a free template.' },
  ],
  report: {
    headline: 'Explore the gap between collecting notes and making decisions.',
    summary: { title: 'A focused opportunity to investigate', detail: 'In this fictional example, note collection is already served by specialist tools and spreadsheets. The more interesting hypothesis is helping independent founders connect a product decision to the interviews behind it. The sample evidence is too small to establish demand or willingness to pay.', kind: 'interpretation', sourceIds: ['S1', 'S2', 'S3'] },
    competitors: [
      { name: 'Fieldnote Example', relationship: 'direct', positioning: 'A fictional research workspace with interview transcripts, searchable notes, and tags for small teams.', pricing: 'Not established in retrieved evidence.', sourceIds: ['S1'] },
      { name: 'Interview Board Example', relationship: 'substitute', positioning: 'A fictional spreadsheet workflow for tracking interviews, themes, and experiments.', pricing: 'Presented as a free template in the fictional excerpt.', sourceIds: ['S3'] },
    ],
    painPoints: [
      { title: 'Evidence gets separated from decisions', detail: 'One fictional participant describes losing the connection between interview notes and product decisions. This illustrates the type of customer testimony the live pipeline should look for; it does not establish prevalence.', kind: 'observed', sourceIds: ['S2'] },
      { title: 'Organizing notes does not settle priorities', detail: 'A second fictional participant distinguishes keeping notes from deciding which complaints matter. More interviews would be needed to understand why that is difficult.', kind: 'observed', sourceIds: ['S2'] },
    ],
    opportunities: [
      { title: 'Make each decision traceable', detail: 'Test a decision card that links a proposed feature to interview excerpts, customer segments, and counterevidence. Its value to real users remains untested.', kind: 'hypothesis', sourceIds: ['S2'] },
      { title: 'Start with one founder workflow', detail: 'A lightweight flow for independent founders may be easier to evaluate than a broad research platform for entire product teams.', kind: 'hypothesis', sourceIds: ['S1', 'S3'] },
    ],
    risks: [
      { title: 'A spreadsheet may already be sufficient', detail: 'The fictional free template covers basic research tracking. A new tool would need a meaningful benefit beyond storing the same information in another interface.', kind: 'interpretation', sourceIds: ['S3'] },
      { title: 'A small sample can overstate a pain point', detail: 'Two illustrative comments cannot establish market demand, frequency, or willingness to switch.', kind: 'interpretation', sourceIds: ['S2'] },
    ],
    improvements: [
      { title: 'Prototype a decision linked to its evidence', detail: 'Let a founder turn a specific interview excerpt into a decision card. Observe whether this resolves the disconnect described in the fictional discussion.', kind: 'hypothesis', sourceIds: ['S2'] },
      { title: 'Compare the prototype with an existing spreadsheet', detail: 'Ask interview participants to complete the same task using both workflows. Look for a concrete reduction in effort before expanding scope.', kind: 'hypothesis', sourceIds: ['S3'] },
    ],
    unknowns: ['Whether real founders experience this problem often enough to change tools.', 'Willingness to pay and a viable price point.', 'Real competitor coverage, adoption, and market size.', 'Whether the suggested workflow improves decisions in practice.'],
  },
};
