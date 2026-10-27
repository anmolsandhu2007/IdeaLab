import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { safeFetch } from './safe-fetch';
import type { IdeaInput, Source } from './schema';

export function researchQueries(input: IdeaInput) {
  const topic = input.idea.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).slice(0, 18).join(' ');
  const market = `${input.customer} ${input.geography}`.trim().slice(0, 150);
  return [`${topic} ${market} competitors alternatives`, `${topic} ${market} customer reviews complaints`];
}
export function parseSearchFeed(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').map((_, item) => $(item).find('link').text().trim()).get().filter(url => /^https?:\/\//.test(url));
}
export function extractPage(html: string, url: string) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || new URL(url).hostname;
  $('script, style, noscript, nav, footer, header, svg, form, iframe, [hidden]').remove();
  const article = $('main, article, [role=main]').first();
  const root = article.length && article.text().length > 300 ? article : $('body');
  root.find('p, h1, h2, h3, li, tr, div, section').append('\n');
  const text = root.text().replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 12_000);
  return { title: title.slice(0, 220), text };
}

export async function discover(input: IdeaInput, warnings: string[]) {
  const results: string[] = [];
  for (const query of researchQueries(input)) {
    try {
      if (process.env.TAVILY_API_KEY) {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 5, search_depth: 'basic' }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error(`Search returned HTTP ${response.status}.`);
        const json = await response.json();
        for (const item of json.results || []) if (typeof item.url === 'string') results.push(item.url);
      } else {
        const response = await safeFetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`);
        const links = parseSearchFeed(response.text);
        if (!links.length) throw new Error('The public search feed returned no usable results.');
        results.push(...links.slice(0, 5));
      }
    } catch (error) { warnings.push(`Discovery: ${error instanceof Error ? error.message : 'Search unavailable.'}`); }
  }
  if (!process.env.TAVILY_API_KEY) warnings.push('Automatic discovery uses an experimental public Bing RSS feed. Coverage and availability are not guaranteed.');
  return [...new Set([...input.sourceUrls, ...results])].slice(0, 10);
}

export async function retrieveSource(raw: string, id: string, submitted: boolean): Promise<Source> {
  const original = new URL(raw);
  const robotsUrl = new URL('/robots.txt', original).href;
  try {
    const robots = await safeFetch(robotsUrl);
    if (robotsParser(robotsUrl, robots.text).isAllowed(raw, 'IdeaLabResearch') === false) throw new Error('This site disallows automated retrieval.');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('disallows') || message.includes('Private and reserved') || /HTTP (401|403|429)/.test(message)) throw error;
    // A missing robots file does not itself prohibit reading a public page.
  }
  const page = await safeFetch(raw);
  if (new URL(page.url).origin !== original.origin) {
    const redirectRobotsUrl = new URL('/robots.txt', page.url).href;
    try {
      const robots = await safeFetch(redirectRobotsUrl);
      if (robotsParser(redirectRobotsUrl, robots.text).isAllowed(page.url, 'IdeaLabResearch') === false) throw new Error('The redirected site disallows automated retrieval.');
    } catch (error) {
      if (error instanceof Error && (error.message.includes('disallows') || /HTTP (401|403|429)/.test(error.message))) throw error;
    }
  }
  const content = /html/i.test(page.type) ? extractPage(page.text, page.url) : { title: new URL(page.url).hostname, text: page.text.slice(0, 12_000) };
  if (content.text.length < 150) throw new Error('The source contains too little readable text.');
  if (/just a moment|verify you are human|enable javascript and cookies/i.test(content.title)) throw new Error('This source requires browser verification.');
  return { id, url: page.url, domain: new URL(page.url).hostname, ...content,
    retrievedAt: new Date().toISOString(), origin: submitted ? 'submitted' : 'discovered' };
}
