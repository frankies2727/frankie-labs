// Campaign money for federal candidates, from the FEC's key-free bulk
// "all candidates" summary (weball26.txt, pipe-delimited, no header).
// https://www.fec.gov/campaign-finance-data/all-candidates-file-description/

const COL = { id: 0, name: 1, ici: 2, receipts: 5, spent: 7, cash: 10, state: 18, district: 19, through: 27 };
const SUFFIX = /^(jr|sr|ii|iii|iv|mr|mrs|ms|dr)$/;

const words = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((w) => w && !SUFFIX.test(w));

export function parseWeball(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const f = line.split('|');
    const [last, rest = ''] = f[COL.name].split(',');
    return {
      id: f[COL.id],
      office: f[COL.id][0], // H or S
      last: words(last),
      first: words(rest),
      ici: f[COL.ici],
      receipts: Number(f[COL.receipts]) || 0,
      spent: Number(f[COL.spent]) || 0,
      cash: Number(f[COL.cash]) || 0,
      state: f[COL.state],
      district: f[COL.district],
      through: f[COL.through],
    };
  });
}

// Match one ballot name to an FEC record in the same race. Returns null unless
// the match is unambiguous — showing no money beats showing someone else's.
export function matchCandidate(name, office, district, records) {
  const pool = records.filter((r) => r.state === 'IL' && r.office === office && r.district === district);
  const w = words(name);
  if (!w.length) return null;
  const last = w[w.length - 1];
  let hits = pool.filter((r) => r.last.includes(last) || r.last.join('') === w.slice(-2).join(''));
  if (hits.length > 1) {
    const first = w[0].slice(0, 3);
    hits = hits.filter((r) => r.first.some((f) => f.startsWith(first) || first.startsWith(f.slice(0, 3))));
  }
  // The same person sometimes has several committees/IDs; they share a name,
  // so keep the one with the latest report.
  const people = new Set(hits.map((r) => `${r.last.join(' ')}|${r.first[0] ?? ''}`));
  if (!hits.length || people.size > 1) return null;
  const best = hits.sort((a, b) => toDate(b.through) - toDate(a.through) || b.receipts - a.receipts)[0];
  return {
    incumbent: best.ici === 'I',
    money: {
      source: 'FEC',
      id: best.id,
      raised: Math.round(best.receipts),
      spent: Math.round(best.spent),
      cash: Math.round(best.cash),
      through: best.through, // MM/DD/YYYY
    },
  };
}

const toDate = (mdy) => {
  const [m, d, y] = (mdy || '').split('/').map(Number);
  return y ? Date.UTC(y, m - 1, d) : 0;
};

// Attach `money` to every federal candidate the FEC file can vouch for.
export function addFederalMoney(races, records) {
  let matched = 0;
  let total = 0;
  for (const race of races) {
    let office = null;
    let district = null;
    if (race.office === 'United States Senator') { office = 'S'; district = '00'; }
    else if (race.area?.type === 'cd') { office = 'H'; district = race.area.id.padStart(2, '0'); }
    if (!office) continue;
    for (const c of race.candidates) {
      total += 1;
      const hit = matchCandidate(c.name, office, district, records);
      if (hit) {
        c.money = hit.money;
        if (hit.incumbent) c.incumbent = true;
        matched += 1;
      }
    }
  }
  return { matched, total };
}
