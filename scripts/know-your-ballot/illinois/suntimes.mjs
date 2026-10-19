// The Chicago Sun-Times / WBEZ school board voter guide: every Chicago Board
// of Education candidate answered the same questionnaire (top three issues, a
// top local concern, six yes/no questions with a 50-word reason, seven
// open-ended questions), and the guide adds CPS background facts and
// education endorsements. Each candidate's page is read and kept as it is:
// the candidate's own answers, the guide's own questions, linked back to the
// page. Nothing is summarized.
//
// Pages are static HTML at a predictable address built from the candidate's
// name ("Aaron “Jitu” Brown" -> aaron-jitu-brown), confirmed for all 42
// candidates; a name that doesn't resolve is skipped. Fail-soft: a page
// that can't be read today keeps yesterday's copy.

const GUIDE = 'https://chicago.suntimes.com/elections/2026/graphics/chicago-school-board-education-voter-guide/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
export const SOURCE = 'Chicago Sun-Times / WBEZ school board voter guide';

export const slug = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[“”"]/g, ' ').replace(/\./g, '').replace(/[^A-Za-z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&#160;|&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const text = (h) => decode(h.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const section = (html, id) => html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)</section>`))?.[1] ?? '';
const paragraphs = (h) => [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean);
const items = (h) => [...h.matchAll(/<li[^>]*>([\s\S]*?)<\/li>(?=\s*(?:<li|<\/[ou]l))/g)].map((m) => m[1]);

/** The guide page as data; null when the page isn't a candidate page. */
export function parseGuide(html) {
  if (!/id="about"/.test(html)) return null;
  const about = section(html, 'about');
  // A candidate who sent no questionnaire back still has the guide's background facts.
  const answered = /id="issues"/.test(html) && /id="open"/.test(html);
  const facts = [...about.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)]
    .map((m) => ({ label: text(m[1]).replace(/^\S+\s/, ''), value: text(m[2]) })).filter((f) => f.label && f.value);
  const endorse = about.match(/Key education endorsements[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/);
  // The list's items may lack closing tags, so split on the opening ones.
  const endorsements = endorse ? endorse[1].split(/<li[^>]*>/).slice(1).map(text).filter(Boolean) : [];
  const teachers = about.match(/elementary school teachers would describe them[\s\S]*?<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const issues = items(section(html, 'issues')).map((li) => { const [title, ...why] = paragraphs(li); return title ? { title, why: why.join(' ') || undefined } : null; }).filter(Boolean);
  const localPs = paragraphs(section(html, 'local'));
  const local = localPs.length >= 2 ? { q: localPs[0], a: localPs.slice(1).join(' ') } : undefined;
  const yesNo = [...section(html, 'yn').matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/g)].map((m) => {
    const body = m[2];
    const q = paragraphs(body)[0];
    const answer = text(body.match(/<span[^>]*>\s*(Yes|No|Unsure|Did not answer|No answer)\s*<\/span>/i)?.[1] ?? '');
    const why = paragraphs(body).slice(1).join(' ');
    return q ? { topic: text(m[1]), q, answer: answer || undefined, why: why || undefined } : null;
  }).filter(Boolean);
  const open = items(section(html, 'open')).map((li) => {
    const ps = paragraphs(li);
    if (ps.length < 2) return null;
    // Numbered item: a short title (sometimes), the question, then the answer.
    const [first, ...rest] = ps;
    const isQuestion = (s) => /\?$/.test(s);
    if (isQuestion(first)) return { q: first, a: rest.join(' ') };
    const qi = rest.findIndex(isQuestion);
    return qi >= 0 ? { title: first, q: rest[qi], a: rest.slice(qi + 1).join(' ') } : { title: first, q: rest[0], a: rest.slice(1).join(' ') };
  }).filter((x) => x && x.a);
  if (!facts.length && !issues.length && !open.length) return null;
  return { answered, facts, endorsements, teachers: teachers ? text(teachers) : undefined, issues, local, yesNo, open };
}

/**
 * Every school board candidate's guide page, keyed "<race id>|<name>", for
 * data/illinois/guide.json (fetched only when a school board candidate's
 * profile opens; it's ~400 KB). A page that can't be read today keeps
 * yesterday's copy from `prev`.
 */
export async function buildGuide(races, { prev = {}, fetchPage = (u) => fetch(u, { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))) } = {}) {
  const out = {};
  const log = [];
  let read = 0, kept = 0;
  const asOf = new Date().toISOString().slice(0, 10);
  for (const r of races) {
    if (r.section !== 'school') continue;
    for (const c of r.candidates) {
      const key = `${r.id}|${c.name}`;
      const url = `${GUIDE}candidates/${slug(c.name)}/`;
      try {
        const data = parseGuide(await fetchPage(url));
        if (!data) throw new Error('not a candidate page');
        out[key] = { ...data, url, source: SOURCE, asOf };
        read += 1;
      } catch (e) {
        if (prev[key]) { out[key] = prev[key]; kept += 1; }
        log.push(`${c.name}: ${e.message}`);
      }
    }
  }
  return { guide: out, read, kept, log };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const dir = new URL('../../../src/projects/know-your-ballot/data/illinois/', import.meta.url);
  const data = JSON.parse(readFileSync(new URL('ballot.json', dir), 'utf8'));
  const file = new URL('guide.json', dir);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const r = await buildGuide(data.races, { prev });
  console.log(`Voter guide: ${r.read} candidates read, ${r.kept} kept`);
  for (const l of r.log) console.log('  ' + l);
  writeFileSync(file, JSON.stringify(r.guide) + '\n');
}
