'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Compass, ExternalLink, FileText, FlaskConical, Globe2, History, Layers3, Lightbulb, LoaderCircle, Plus, Search, Settings2, ShieldCheck, Sparkles, Target, TriangleAlert, Users, X } from 'lucide-react';
import type { Finding, IdeaInput, Run, Source } from '@/lib/schema';
import { sampleRun } from '@/lib/sample';
import { DEFAULT_MODEL } from '@/lib/models';

type Config = { configured: boolean; model: string; search: string; storage: string; mode: string; authRequired?: boolean };
const examples = [
  { label: 'A tool for founders', idea: 'A research workspace that helps independent founders organize customer interviews, identify recurring pain points, and link product decisions to evidence.', customer: 'Independent founders and early-stage startup teams' },
  { label: 'A local service', idea: 'A service that connects apartment residents with reliable local repair technicians, with transparent pricing and scheduled arrival windows.', customer: 'Apartment residents in Indian cities' },
  { label: 'A new marketplace', idea: 'A marketplace where small restaurants can buy surplus ingredients from nearby suppliers at a discount, with same-day pickup.', customer: 'Independent restaurants and local food suppliers' },
];
const tabs = ['Overview', 'Competitors', 'Customer signals', 'Opportunities', 'Sources'] as const;
type Tab = typeof tabs[number];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const json = await response.json();
  if (response.status === 401) window.location.assign('/login');
  if (!response.ok) throw new Error(json.error || 'The request could not be completed.');
  return json;
}
function shortDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function runLabel(status: Run['status']) { return ({ queued: 'Queued', running: 'Researching', completed: 'Ready', failed: 'Needs attention' })[status]; }

export default function Workspace() {
  const [view, setView] = useState<'new' | 'history' | 'report'>('new');
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<Tab>('Overview');
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idea, setIdea] = useState('');
  const [customer, setCustomer] = useState('');
  const [geography, setGeography] = useState('');
  const [businessModel, setBusinessModel] = useState('');
  const [urls, setUrls] = useState('');
  const [showContext, setShowContext] = useState(false);
  const selectedId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([api<Run[]>('/api/runs'), api<Config>('/api/settings')]);
      setRuns(list); setConfig(settings); setError('');
      if (selectedId.current && selectedId.current !== 'sample') {
        const found = list.find(r => r.id === selectedId.current);
        if (found) setSelected(found);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the workspace.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const hasActive = runs.some(r => ['running', 'queued'].includes(r.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [hasActive, refresh]);

  function openRun(run: Run) { selectedId.current = run.id; setSelected(run); setView('report'); setTab('Overview'); setError(''); }
  function newIdea() { setView('new'); selectedId.current = null; setSelected(null); setError(''); }
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); window.location.replace('/login'); }
    catch { setError('Could not sign out. Please try again.'); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!config?.configured) { setSettings(true); return; }
    const sourceUrls = urls.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (sourceUrls.length > 6) { setError('Please enter up to six source URLs.'); return; }
    setBusy(true);
    try {
      const input: IdeaInput = { idea, customer, geography, businessModel, sourceUrls };
      const run = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify(input) });
      setRuns(previous => [run, ...previous]); openRun(run);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start research.'); }
    finally { setBusy(false); }
  }
  async function retry() {
    if (!selected) return; setBusy(true); setError('');
    try { await api(`/api/runs/${selected.id}/retry`, { method: 'POST' }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Retry failed.'); }
    finally { setBusy(false); }
  }
  function exportReport() {
    if (!selected?.report) return;
    const blob = new Blob([JSON.stringify({ sample: selected.id === 'sample', ...selected }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `idea-lab-${selected.id === 'sample' ? 'sample' : selected.id.slice(0, 8)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const completed = runs.filter(r => r.status === 'completed');
  const isSample = selected?.id === 'sample';

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={newIdea} aria-label="Idea Lab home"><span className="brand-icon"><FlaskConical size={23} strokeWidth={1.8} /></span><span>idea<span className="brand-light">lab</span><span className="brand-dot">.</span></span></button>
      <div className="workspace-label">YOUR WORKSPACE <span>LOCAL</span></div>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === 'new' ? 'active' : ''}`} onClick={newIdea}><Compass size={18} />New validation<Plus size={16} className="push-right" /></button>
        <button className={`nav-item ${view === 'history' || (view === 'report' && !isSample) ? 'active' : ''}`} onClick={() => setView('history')}><History size={18} />Research history<span className="count">{runs.length}</span></button>
        <button className={`nav-item ${isSample && view === 'report' ? 'active' : ''}`} onClick={() => openRun(sampleRun)}><BookOpen size={18} />Sample report<ArrowUpRight size={15} className="push-right" /></button>
      </nav>
      {runs.length > 0 && <div className="sidebar-recent"><div className="workspace-label">RECENT IDEAS</div>{runs.slice(0, 4).map(run => <button key={run.id} onClick={() => openRun(run)}><span className={`tiny-dot ${run.status}`} />{run.title}</button>)}</div>}
      <div className="sidebar-bottom">
        <div className="quiet-card"><div className="quiet-orbit"><Lightbulb size={22} strokeWidth={1.6} /></div><strong>A little clarity.<br />A better starting point.</strong><p>Research your assumptions before you invest in them.</p><button onClick={() => setHelp(true)}>How it works <ArrowUpRight size={14} /></button></div>
        <button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={17} />Settings<span className={`status-dot ${config?.configured ? 'online' : ''}`} /></button>
        <div className="profile"><div className="avatar">Y</div><div><strong>Your workspace</strong><span>Local prototype</span></div><span className="profile-mark">01</span></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={14} /><span>{view === 'new' ? 'New validation' : view === 'history' ? 'Research history' : isSample ? 'Sample report' : 'Validation report'}</span></div><div className="topbar-actions"><span className="local-pill"><span />{config?.authRequired ? 'Private workspace' : 'Local workspace'}</span>{config?.authRequired && <button className="text-button" onClick={logout}>Sign out</button>}<button className="icon-button" aria-label="How Idea Lab works" onClick={() => setHelp(true)}><CircleHelp size={19} /></button></div></header>
      <div className="content">
        {error && <div role="alert" className="notice error"><TriangleAlert size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {view === 'new' && <>
          <div className="page-heading"><div className="eyebrow"><span /> A SMALL STEP BEFORE THE BIG LEAP</div><h1>Good ideas deserve<br /><span>a closer look.</span></h1><p>Explore the competition. Understand the pain points.<br className="desktop-break" /> Find a stronger direction for what you want to build.</p></div>
          <div className="new-grid">
            <section className="idea-card">
              <div className="card-kicker"><span className="mini-icon"><Sparkles size={17} /></span>LET’S START WITH YOUR IDEA<span className="step-tag">01 / 03</span></div>
              <form onSubmit={submit}>
                <label className="idea-label" htmlFor="idea">What are you thinking of building?</label><p className="field-hint">A rough idea is enough. Tell us what it does and who it helps.</p>
                <div className="textarea-wrap"><textarea id="idea" placeholder="I want to build a platform that helps…" minLength={30} maxLength={4000} required value={idea} onChange={e => setIdea(e.target.value)} /><span className={idea.length > 3800 ? 'char-count warning-text' : 'char-count'}>{idea.length.toLocaleString()} / 4,000</span></div>
                <div className="example-row"><span>Need a starting point?</span>{examples.map(example => <button type="button" key={example.label} onClick={() => { setIdea(example.idea); setCustomer(example.customer); }}>{example.label}<ArrowUpRight size={12} /></button>)}</div>
                <div className="form-divider" />
                <div className="field-grid"><div><label htmlFor="customer"><Users size={14} />Target customer <span>optional</span></label><input id="customer" maxLength={300} placeholder="e.g. Independent founders" value={customer} onChange={e => setCustomer(e.target.value)} /></div><div><label htmlFor="geography"><Globe2 size={14} />Geography <span>optional</span></label><input id="geography" maxLength={150} placeholder="e.g. India, global" value={geography} onChange={e => setGeography(e.target.value)} /></div></div>
                <button type="button" className="context-toggle" aria-expanded={showContext} onClick={() => setShowContext(!showContext)}><Plus size={15} className={showContext ? 'rotate' : ''} />Add business model & source URLs<span>optional</span></button>
                {showContext && <div className="extra-context"><label htmlFor="business">Business model</label><input id="business" maxLength={300} value={businessModel} onChange={e => setBusinessModel(e.target.value)} placeholder="e.g. Monthly subscription" /><label htmlFor="urls">Public source URLs <span>up to 6, one per line</span></label><textarea id="urls" className="urls-input" value={urls} onChange={e => setUrls(e.target.value)} placeholder={'https://competitor.com/pricing\nhttps://community.example/discussion'} /><p className="field-hint">Useful competitor pages and customer discussions improve coverage. Private or blocked pages are skipped.</p></div>}
                <div className="form-footer"><span><ShieldCheck size={15} />Saved locally. Research uses external services.</span><button className="primary-button" disabled={busy || loading} type="submit">{busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{busy ? 'Starting…' : 'Research my idea'}<ArrowRight size={16} /></button></div>
                {!config?.configured && !loading && <div className="setup-hint"><span className="tiny-dot" />Connect a NVIDIA key in Settings to start live research. <button type="button" onClick={() => setSettings(true)}>Set up <ArrowUpRight size={12} /></button></div>}
              </form>
            </section>
            <aside className="research-aside"><div className="aside-title"><span className="round-icon"><Compass size={19} /></span><h2>From a hunch<br />to a clearer picture.</h2></div><div className="process-list"><Process number="01" title="Map the landscape" text="Find competitors, alternatives, and the space your idea could occupy." /><Process number="02" title="Listen for the friction" text="Look for customer complaints, unmet needs, and recurring pain points." /><Process number="03" title="Find a better angle" text="Get a source-linked report with risks and ways to strengthen your idea." last /></div><div className="aside-note"><span className="asterisk">✳</span><p>Evidence to think with.<br /><strong>You make the call.</strong></p></div></aside>
          </div>
          <section className="recent-section"><div className="section-header"><h2>Your research <span>{runs.length}</span></h2><button onClick={() => setView('history')}>View history <ArrowRight size={15} /></button></div>{loading ? <div className="empty-row"><LoaderCircle size={19} className="spin" />Loading your workspace…</div> : runs.length ? <div className="run-grid">{runs.slice(0, 3).map(run => <RunCard key={run.id} run={run} onClick={() => openRun(run)} />)}</div> : <div className="empty-research"><span className="empty-icon"><Layers3 size={22} strokeWidth={1.4} /></span><div><strong>Your next idea starts here.</strong><p>Finished reports will live here, ready to revisit.</p></div><button className="secondary-button" onClick={() => openRun(sampleRun)}>Explore a sample<ArrowUpRight size={15} /></button></div>}</section>
          <div className="bottom-note"><span className="tiny-dot" />Built for curiosity. Grounded in evidence.<span className="bottom-version">EARLY WORKSPACE · V0.1</span></div>
        </>}

        {view === 'history' && <><div className="history-heading"><div><div className="eyebrow">YOUR IDEAS, REVISITED</div><h1>Research history<span>.</span></h1><p>A place for everything you’ve explored.</p></div><button className="primary-button" onClick={newIdea}><Plus size={16} />New validation</button></div><div className="stats-row"><Stat value={runs.length} label="Ideas explored" /><Stat value={completed.length} label="Reports ready" /><Stat value={runs.filter(r => r.status === 'running' || r.status === 'queued').length} label="In progress" /></div>{loading ? <div className="empty-row"><LoaderCircle className="spin" />Loading reports…</div> : runs.length ? <div className="run-grid history-grid">{runs.map(run => <RunCard key={run.id} run={run} onClick={() => openRun(run)} />)}</div> : <div className="large-empty"><BookOpen size={38} strokeWidth={1} /><h2>Your research shelf is waiting.</h2><p>Start with an idea, or explore the sample report to see the format.</p><button className="secondary-button" onClick={() => openRun(sampleRun)}>Open sample report<ArrowRight size={15} /></button></div>}</>}

        {view === 'report' && selected && <>
          <div className="report-toolbar"><button className="text-button" onClick={newIdea}><ArrowLeft size={16} />Back to workspace</button><div>{selected.report && <><button className="secondary-button" onClick={() => window.print()}><FileText size={15} />Print / PDF</button><button className="secondary-button" onClick={exportReport}><ArrowDownToLine size={15} />Export JSON</button></>}</div></div>
          {isSample && <div className="notice sample-notice"><FlaskConical size={18} /><span><strong>Illustrative sample.</strong> All companies, excerpts, and findings below are fictional. This is a preview of the report format.</span></div>}
          <div className="report-heading"><div className="eyebrow">{isSample ? 'SAMPLE VALIDATION' : 'IDEA VALIDATION'}<span className={`report-status ${selected.status}`}>{runLabel(selected.status)}</span></div><h1>{selected.report?.headline || 'Let’s look a little closer.'}</h1><p className="report-idea">{selected.input.idea}</p><div className="report-meta">{selected.input.customer && <span><Users size={14} />{selected.input.customer}</span>}{selected.input.geography && <span><Globe2 size={14} />{selected.input.geography}</span>}<span><History size={14} />{shortDate(selected.createdAt)}</span></div></div>
          {!selected.report && <div className="progress-panel"><div className="progress-symbol">{selected.status === 'failed' ? <TriangleAlert size={28} /> : <LoaderCircle size={28} className="spin" />}</div><h2>{selected.stage}</h2><p>{selected.error || 'The research worker runs separately, so you can keep exploring this workspace.'}</p><div className="progress-track"><div style={{ width: `${selected.progress}%` }} /></div><div className="progress-caption"><span>{selected.sources.length} sources retrieved</span><span>{selected.progress}%</span></div>{(selected.status === 'failed' || Date.now() - Date.parse(selected.updatedAt) > 15 * 60_000) && <><p className="field-hint">Interrupted runs can be restarted. If retrieval failed, try a new validation with accessible source URLs.</p><button className="primary-button" disabled={busy} onClick={retry}>{busy && <LoaderCircle className="spin" size={16} />}Retry research<ArrowRight size={16} /></button></>}</div>}
          {selected.report && <>
            <div className="report-stats"><Stat value={selected.sources.length} label={isSample ? 'Fictional source excerpts' : 'Retrieved sources'} /><Stat value={selected.report.competitors.length} label="Competitors & substitutes" /><Stat value={selected.report.painPoints.length} label="Customer pain signals" /><Stat value={selected.report.unknowns.length} label="Open questions" /></div>
            <div className="report-tabs" role="tablist" aria-label="Report sections">{tabs.map(item => <button key={item} role="tab" aria-selected={tab === item} aria-controls={`panel-${item.replaceAll(' ', '-')}`} id={`tab-${item.replaceAll(' ', '-')}`} onClick={() => setTab(item)} className={tab === item ? 'selected' : ''}>{item}{item === 'Sources' && <span>{selected.sources.length}</span>}</button>)}</div>
            <div role="tabpanel" id={`panel-${tab.replaceAll(' ', '-')}`} aria-labelledby={`tab-${tab.replaceAll(' ', '-')}`} className="report-body">
              {tab === 'Overview' && <><section className="summary-card"><div className="section-kicker"><Target size={17} />THE RESEARCH READOUT</div><h2>{selected.report.summary.title}</h2><p>{selected.report.summary.detail}</p><FindingFooter finding={selected.report.summary} sources={selected.sources} onSource={setSource} /></section><div className="report-columns"><FindingSection title="Risks to keep in view" icon={<TriangleAlert size={18} />} items={selected.report.risks} sources={selected.sources} onSource={setSource} empty="No evidence-grounded risks were established. This is not evidence of low risk." /><section className="unknowns-card"><div className="section-title"><CircleHelp size={18} /><h2>What we still don’t know</h2></div><p className="section-description">Missing evidence is part of the picture.</p>{selected.report.unknowns.map((item, i) => <div className="unknown-item" key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></div>)}</section></div><FindingSection title="Ways to strengthen the idea" icon={<Lightbulb size={18} />} items={selected.report.improvements} sources={selected.sources} onSource={setSource} empty="The retrieved evidence was insufficient for specific improvement suggestions." /></>}
              {tab === 'Competitors' && <section><div className="section-title"><Compass size={19} /><h2>The competitive landscape</h2></div><p className="section-description">Direct competitors, adjacent products, and substitutes found in the available evidence.</p>{!selected.report.competitors.length && <EmptyFinding text="No competitors could be established from the retrieved evidence. Broader discovery is needed." />}<div className="competitor-grid">{selected.report.competitors.map((item, i) => <article className="competitor-card" key={i}><div className="competitor-top"><span className="company-initial">{item.name.charAt(0)}</span><span className="kind-pill neutral">{item.relationship}</span></div><h3>{item.name}</h3><p>{item.positioning}</p><div className="pricing"><span>PRICING EVIDENCE</span><p>{item.pricing}</p></div><Citations ids={item.sourceIds} sources={selected.sources} onSource={setSource} /></article>)}</div></section>}
              {tab === 'Customer signals' && <FindingSection title="Where customers feel the friction" description="Signals from retrieved discussions and reviews. A few comments cannot establish how common a problem is." icon={<Users size={19} />} items={selected.report.painPoints} sources={selected.sources} onSource={setSource} empty="No customer pain signals were established. Vendor pages alone do not show customer demand." />}
              {tab === 'Opportunities' && <><FindingSection title="Angles worth investigating" description="These are opportunity hypotheses to test, not proven market gaps." icon={<Lightbulb size={19} />} items={selected.report.opportunities} sources={selected.sources} onSource={setSource} empty="The current evidence does not support specific opportunity hypotheses." /><FindingSection title="Ways to strengthen the idea" icon={<Sparkles size={19} />} items={selected.report.improvements} sources={selected.sources} onSource={setSource} empty="Collect more evidence before choosing a direction." /></>}
              {tab === 'Sources' && <section><div className="section-title"><BookOpen size={19} /><h2>{isSample ? 'Illustrative evidence library' : 'Evidence library'}</h2></div><p className="section-description">{isSample ? 'These excerpts were written for the sample. They were not fetched from the web.' : 'Readable text retrieved for this report. Open a source to inspect what the model received.'}</p>{selected.sources.map(item => <button className="source-row" key={item.id} onClick={() => setSource(item)}><span className="source-id">{item.id}</span><div><h3>{item.title}</h3><p>{item.domain} · {isSample ? 'Fictional fixture' : `Retrieved ${shortDate(item.retrievedAt)}`} · {item.origin === 'submitted' ? 'Supplied source' : 'Search discovery'}</p></div><ArrowUpRight size={18} /></button>)}</section>}
            </div>
            <div className="report-disclaimer"><ShieldCheck size={17} /><p>Source references are checked against retrieved IDs. This does not automatically verify that a source supports every claim. Review the evidence before making decisions.</p></div>
          </>}
          {selected.warnings.length > 0 && !isSample && <details className="research-warnings"><summary><TriangleAlert size={16} />Research limitations & retrieval notes ({selected.warnings.length})</summary><ul>{selected.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
        </>}
      </div>
    </main>
    {settings && <SettingsDialog config={config} onClose={() => setSettings(false)} onSave={value => { setConfig(value); setSettings(false); }} />}
    {help && <Dialog title="A clearer starting point" onClose={() => setHelp(false)}><p className="dialog-intro">Idea Lab researches a business idea and turns available evidence into a structured report.</p><div className="help-steps"><Process number="01" title="Describe the idea" text="Add your customer, market, and useful source URLs if you have them." /><Process number="02" title="Research the evidence" text="The worker searches public sources, extracts readable pages, and sends the evidence to your selected NVIDIA-hosted model." /><Process number="03" title="Read with a critical eye" text="Inspect citations, distinguish hypotheses from observations, and use open questions to plan further research." last /></div><div className="notice"><ShieldCheck size={18} /><span>This is a local, single-user prototype. Ideas and extracted source text are sent to NVIDIA; search queries go to the configured search service. It does not predict startup success.</span></div><button className="primary-button full-width" onClick={() => { setHelp(false); openRun(sampleRun); }}>Explore the sample report<ArrowRight size={16} /></button></Dialog>}
    {source && <Dialog title={source.title} onClose={() => setSource(null)} wide><div className="source-dialog-meta"><span className="source-id">{source.id}</span><span>{source.domain}</span>{source.retrievedAt && <span>Retrieved {new Date(source.retrievedAt).toLocaleString()}</span>}</div>{source.retrievedAt ? <a className="source-external" href={source.url} target="_blank" rel="noopener noreferrer">Open original page<ExternalLink size={14} /></a> : <div className="notice sample-notice">Fictional sample excerpt. This page was not retrieved.</div>}<h3 className="excerpt-label">EXTRACTED SOURCE TEXT</h3><pre className="source-excerpt">{source.text}</pre><p className="field-hint">Extraction is capped at 12,000 characters per page; up to 8,500 are sent to the model. Pages can change after retrieval.</p></Dialog>}
  </div>;
}

function Process({ number, title, text, last }: { number: string; title: string; text: string; last?: boolean }) {
  return <div className={`process ${last ? 'last' : ''}`}><span className="process-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}
function Stat({ value, label }: { value: number; label: string }) { return <div className="stat"><strong>{String(value).padStart(2, '0')}</strong><span>{label}</span></div>; }
function RunCard({ run, onClick }: { run: Run; onClick: () => void }) {
  return <button className="run-card" onClick={onClick}><div className="run-top"><span className="mini-icon"><FileText size={17} /></span><span className={`report-status ${run.status}`}><span className={`tiny-dot ${run.status}`} />{runLabel(run.status)}</span></div><h3>{run.title}</h3><p>{run.input.customer || 'Customer not specified'}</p><div className="run-bottom"><span>{shortDate(run.createdAt)} · {run.sources.length} sources</span><ArrowUpRight size={17} /></div></button>;
}
function Citations({ ids, sources, onSource }: { ids: string[]; sources: Source[]; onSource: (source: Source) => void }) {
  return <div className="citations">{ids.length > 0 && <span>Sources</span>}{ids.map(id => { const source = sources.find(s => s.id === id); return source ? <button key={id} title={source.title} onClick={() => onSource(source)}>{id}<ArrowUpRight size={10} /></button> : null; })}</div>;
}
function FindingFooter({ finding, sources, onSource }: { finding: Finding; sources: Source[]; onSource: (source: Source) => void }) {
  return <div className="finding-footer"><span className={`kind-pill ${finding.kind}`}>{finding.kind === 'observed' ? 'Observed in source' : finding.kind === 'interpretation' ? 'Interpretation' : 'Hypothesis to test'}</span><Citations ids={finding.sourceIds} sources={sources} onSource={onSource} /></div>;
}
function EmptyFinding({ text }: { text: string }) { return <div className="empty-finding"><Search size={20} /><p>{text}</p></div>; }
function FindingSection({ title, description, icon, items, sources, onSource, empty }: { title: string; description?: string; icon: React.ReactNode; items: Finding[]; sources: Source[]; onSource: (source: Source) => void; empty: string }) {
  return <section className="finding-section"><div className="section-title">{icon}<h2>{title}</h2></div>{description && <p className="section-description">{description}</p>}{!items.length && <EmptyFinding text={empty} />}<div className="finding-list">{items.map((item, i) => <article className="finding" key={i}><div className="finding-heading"><span>{String(i + 1).padStart(2, '0')}</span><h3>{item.title}</h3></div><p>{item.detail}</p><FindingFooter finding={item} sources={sources} onSource={onSource} /></article>)}</div></section>;
}

function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`dialog ${wide ? 'wide' : ''}`} tabIndex={-1} ref={ref}><div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</div></div>;
}
function SettingsDialog({ config, onClose, onSave }: { config: Config | null; onClose: () => void; onSave: (value: Config) => void }) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(config?.model || DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const value = await api<Config>('/api/settings', { method: 'POST', body: JSON.stringify({ key: key || undefined, model }) }); setKey(''); onSave(value); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Workspace settings" onClose={onClose}><div className="provider-card"><span className="provider-mark">N</span><div><strong>NVIDIA-hosted models</strong><p>Nemotron preferred · Gemma supported by model ID</p></div><span className={`kind-pill ${config?.configured ? 'observed' : 'neutral'}`}>{config?.configured ? 'Key configured' : 'Setup needed'}</span></div><p className="dialog-intro">Use a NVIDIA Developer API key with an endpoint available to your account. Free prototype access has model-specific availability and limits.</p><form onSubmit={save}><label htmlFor="nvidia-key">NVIDIA API key</label><input id="nvidia-key" type="password" autoComplete="off" spellCheck={false} required={!config?.configured} placeholder={config?.configured ? 'Key configured — leave blank to keep it' : 'nvapi-…'} value={key} onChange={e => setKey(e.target.value)} /><p className="field-hint">Saved only in this server’s memory until restart. Never returned to the browser. For persistence, use NVIDIA_API_KEY in .env.local.</p><label htmlFor="model">Model ID</label><input id="model" value={model} onChange={e => setModel(e.target.value)} required spellCheck={false} /><p className="field-hint">Use the exact nvidia/… or google/… ID from an accessible NVIDIA endpoint. Saving does not verify access; the first research run does.</p><a className="source-external" href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer">Open NVIDIA API catalog<ExternalLink size={13} /></a><div className="settings-facts"><div><span>Database</span><strong>{config?.storage || 'Local SQLite'}</strong></div><div><span>Search discovery</span><strong>{config?.search === 'tavily' ? 'Tavily API' : 'Public Bing RSS · experimental'}</strong></div><div><span>Deployment</span><strong>{config?.authRequired ? 'Private shared workspace' : 'Local · single user'}</strong></div></div>{error && <div className="notice error" role="alert">{error}</div>}<button className="primary-button full-width" disabled={busy} type="submit">{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save configuration</button></form></Dialog>;
}
