import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}
export async function checkedUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port))) throw new Error('Only public HTTP(S) URLs on standard ports are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private and reserved network addresses are blocked.');
  return { url, address: addresses.find(a => a.family === 4) || addresses[0] };
}

export async function safeFetch(raw: string, redirects = 0): Promise<{ text: string; url: string; type: string; status: number }> {
  if (redirects > 4) throw new Error('Too many redirects.');
  const { url, address } = await checkedUrl(raw);
  const result = await new Promise<{ text: string; type: string; status: number; location?: string }>((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      headers: { 'User-Agent': 'IdeaLabResearch/0.1', Accept: 'text/html,application/rss+xml,application/xml,text/plain;q=0.9' },
      // Pin the checked address; a second DNS lookup cannot redirect to a private host.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      family: address.family,
    }, response => {
      const status = response.statusCode || 0;
      const type = String(response.headers['content-type'] || '');
      if (status >= 300 && status < 400) {
        response.resume(); resolve({ text: '', type, status, location: response.headers.location }); return;
      }
      if (!/(text\/|xml|json)/i.test(type)) {
        response.resume(); reject(new Error('This source is not a readable text page.')); return;
      }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1_200_000) { req.destroy(new Error('Source exceeded the download limit.')); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), type, status }));
      response.on('error', reject);
    });
    const deadline = setTimeout(() => req.destroy(new Error('Source timed out.')), 20_000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject); req.end();
  });
  if (result.location) return safeFetch(new URL(result.location, url).href, redirects + 1);
  if (result.status < 200 || result.status >= 300) throw new Error(`Source returned HTTP ${result.status}.`);
  return { ...result, url: url.href };
}
