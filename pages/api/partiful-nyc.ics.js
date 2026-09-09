import { load } from 'cheerio';

const EXPLORE_URL = 'https://partiful.com/explore/nyc';
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache = { at: 0, body: '' };

function esc(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function jsonLdEvent(html) {
  const $ = load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const candidates = item?.['@type'] === 'Event' ? [item] : (item?.['@graph'] || []);
        const event = candidates.find(x => x?.['@type'] === 'Event');
        if (event) return event;
      }
    } catch (_) {}
  }
  return null;
}

function eventFromHtml(html, url) {
  const $ = load(html);
  const ld = jsonLdEvent(html) || {};
  const title = ld.name || $('meta[property="og:title"]').attr('content') || $('title').text();
  const start = ld.startDate;
  const end = ld.endDate || start;
  const location = typeof ld.location === 'string'
    ? ld.location
    : ld.location?.name || ld.location?.address?.streetAddress || '';
  const description = ld.description || $('meta[property="og:description"]').attr('content') || '';
  if (!title || !start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime()) || startDate < new Date()) return null;
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  const text = `${location} ${description}`.toLowerCase();
  if (!/(new york|nyc|brooklyn|queens|bronx|staten island|manhattan)/i.test(text)) return null;
  return { title: title.replace(/\s*[-|]\s*Partiful.*$/i, '').trim(), start: startDate, end: Number.isNaN(endDate.getTime()) ? new Date(startDate.getTime() + 2 * 60 * 60 * 1000) : endDate, location, description, url };
}

async function buildFeed() {
  const explore = await fetch(EXPLORE_URL, { headers: { 'user-agent': 'Mozilla/5.0 Partiful-NYC-Calendar/1.0' } });
  if (!explore.ok) throw new Error(`Explore returned ${explore.status}`);
  const html = await explore.text();
  const $ = load(html);
  const urls = [...new Set($('a[href*="/e/"]').map((_, a) => $(a).attr('href')).get())]
    .map(href => new URL(href, 'https://partiful.com').href)
    .filter(url => /^https:\/\/partiful\.com\/e\/[^/?#]+/.test(url))
    .slice(0, 100);

  const events = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Partiful-NYC-Calendar/1.0' } });
      if (!res.ok) continue;
      const event = eventFromHtml(await res.text(), url);
      if (event) events.push(event);
    } catch (_) {}
  }

  events.sort((a, b) => a.start - b.start);
  const unique = [];
  const seen = new Set();
  for (const event of events) {
    const key = `${event.title}|${event.start.toISOString()}|${event.location}`.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(event); }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Partiful NYC Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Partiful NYC',
    'X-WR-TIMEZONE:America/New_York',
  ];

  for (const event of unique) {
    const dtStart = icsDate(event.start);
    const dtEnd = icsDate(event.end);
    if (!dtStart || !dtEnd) continue;
    const uid = `partiful-${Buffer.from(`${event.url}|${event.start.toISOString()}`).toString('base64url')}@partiful-nyc-calendar`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${esc(event.title)}`,
      event.location ? `LOCATION:${esc(event.location)}` : '',
      event.description ? `DESCRIPTION:${esc(event.description.slice(0, 2000))}` : '',
      `URL:${event.url}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400');
  try {
    if (!cache.body || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), body: await buildFeed() };
    }
    res.status(200).send(cache.body);
  } catch (error) {
    if (cache.body) return res.status(200).send(cache.body);
    res.status(200).send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Partiful NYC Calendar//EN\r\nEND:VCALENDAR\r\n');
  }
}
