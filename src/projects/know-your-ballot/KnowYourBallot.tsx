import { ChevronDown, Crosshair, ListChecks, Loader2, MapPin, Printer, Search, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import rawData from './data/illinois/ballot.json';
import { ballotFor, ballotIdsFor, districtsAt, geocode, inChicago, inCook, inIllinois, prefetchDistricts } from './lookup';
import { RETENTION_EXPLAINER } from './offices';
import { BallotSearch, type Hit } from './Search';
import { GovbotChrome } from './GovbotChrome';
import { StateMap } from './Hero';
import outline from './data/illinois/outline.json';
import { GaugeDefs } from './BarRatings';
import { BrowsingNotice, Confetti, ContinueCard, HowBallotWorks, Ring, SectionCards, useBallotView, useDocumentMeta, type SectionCard } from './Bits';
import { ReadOnlyContext } from './state';
import { ContentsColumn, ContentsDrawer } from './Contents';
import { Headliners } from './Headliners';
import { earnedTrophies, streak, Trophies } from './Progress';
import './ballot.css';
import { ClearButton } from '../../components/ClearButton';
import { SinceLastVisit } from './Updates';
import { KeyDates, NextElectionNote } from './Calendar';
import { Laws } from './Laws';
import { LINKS, PlanToVote } from './PlanToVote';
import { areaLabel, CandidateSheet, Compare, MeasureCard, RaceCard, RetentionCard, SCOPE } from './Race';
import { billItems, changeItems, dateItems, Feed, newsItems } from './Feed';
import { billUrl } from './Laws';
import { forVoter, NOV_3 } from './dates';
import { drawShareCard, shareCard } from './share';
import { daysUntil, hasProgress, isDecided, today, readResumeLink, resumeLink, useOpen, useSaved, type Choice, type Saved } from './store';
import type { BallotData, Candidate, Districts, Outline, Race } from './types';

const data = rawData as unknown as BallotData;
const ballotIds = (d: Districts) => ballotIdsFor(data, d);
const everything = ballotFor(data, null);
// The races every Illinois voter sees, for the landing page's cards.
const STATEWIDE = data.races.filter((r) => !r.area && (r.section === 'federal' || r.section === 'state'));
const SHARE_URL = `https://frankies2727.github.io${import.meta.env.BASE_URL}projects/know-your-ballot-illinois`;
// Runs elections in suburban Cook (the Chicago Board runs Chicago's).
const COOK_CLERK = 'https://www.cookcountyclerkil.gov/';
// Elsewhere in Illinois each county clerk (or city board) runs elections.
const ELECTION_AUTHORITIES = 'https://www.elections.il.gov/ElectionOperations/ElectionAuthorities.aspx';
// govbot's list of every Illinois race, for browsing beyond Cook. When this
// guide takes over govbot's elections.html, point this at the old page's new
// name (elections-classic.html).
const GOVBOT_ALL_RACES = 'https://chihacknight.github.io/govbot/dashboard/elections.html';

// Ballot order. Section colours are govbot's accents (ballot.css, govbot.css);
// each reads with the page background as its ink in both themes. Party never
// gets a colour.
const INK = 'var(--gb-bg)';
const SECTIONS = [
  { id: 'federal', title: 'Federal', color: 'var(--gb-blue-hi)', ink: INK, emoji: '🏛️' },
  { id: 'state', title: 'Illinois', color: 'var(--gb-purple)', ink: INK, emoji: '⭐' },
  { id: 'county', title: 'Cook County', color: 'var(--kyb-orange)', ink: INK, emoji: '🏙️' },
  { id: 'judicial', title: 'Judges', color: 'var(--kyb-gold)', ink: INK, emoji: '⚖️' },
  { id: 'retention', title: 'Keep these judges?', color: 'var(--kyb-gold)', ink: INK, emoji: '🧑‍⚖️' },
  { id: 'school', title: 'Chicago school board', color: 'var(--gb-primary)', ink: INK, emoji: '🍎' },
  { id: 'measures', title: 'Ballot questions', color: 'var(--gb-red)', ink: INK, emoji: '🗳️' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_TITLES: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]));
// ...and the rest of the ballot by section, for the cards under them.
const MORE: SectionCard[] = SECTIONS.map((s) => {
  const races = s.id === 'retention' || s.id === 'measures' ? [] : everything.races.filter((r) => r.section === s.id && !STATEWIDE.includes(r));
  const items = s.id === 'retention' ? everything.retentions.filter((r) => !r.withdrawn).map((r) => ({ id: r.id, title: `Retain ${r.judge}?`, sub: r.court }))
    : s.id === 'measures' ? everything.measures.map((m) => ({ id: m.id, title: m.title, sub: SCOPE[m.scope.type](m), question: m.question, plain: m.plain }))
    : races.map((r) => ({ id: r.id, title: r.office, sub: areaLabel(r), race: r }));
  const hint = s.id === 'retention' ? 'All of Cook County · yes or no' : s.id === 'measures' ? 'By ward or precinct · yes or no' : races.some((r) => r.area) ? 'By district' : 'All of Cook County';
  return { ...s, n: items.length, hint, items };
}).filter((c) => c.n > 0);

/** A section colour as a real colour (the share card is drawn on a canvas, which can't read CSS variables). */
const cssColor = (v: string) => {
  const m = v.match(/^var\((--[\w-]+)\)$/);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#3DDC84' : v;
};

/** A pick in words: what the contest is and what the voter chose. */
function describePick(id: string, c: Choice | undefined, numbered = false): { what: string; pick: string } {
  const race = data.races.find((r) => r.id === id);
  if (race) {
    const chosen = Array.isArray(c)
      ? race.candidates.filter((x) => c.includes(x.ballot)).map((x) => (numbered && race.numbered !== false ? `#${x.ballot} ${x.name}` : x.name)).join(', ')
      : '';
    return { what: race.office, pick: chosen || (c === 'skip' ? 'Skip' : '—') };
  }
  const ret = data.retentions.find((r) => r.id === id);
  const m = data.measures.find((x) => x.id === id);
  const answer = c === 'yes' ? 'Yes' : c === 'no' ? 'No' : c === 'skip' ? 'Skip' : '—';
  return { what: ret ? `Retain ${ret.judge}?` : m?.title ?? id, pick: answer };
}

/** What a new address did to the voter's ballot, shown once after the lookup. */
interface BallotChange {
  districts: { label: string; from?: string; to?: string }[];
  kept: { what: string; pick: string }[];
  cleared: { what: string; pick: string }[];
  /** Contests on the new ballot that weren't on the old one. */
  added: string[];
}

// In the order the Board of Elections lists them.
const DISTRICT_CHIPS: [keyof Districts, string][] = [
  ['precinct', 'Precinct'], ['ward', 'Ward'], ['cd', 'Congress'], ['sldu', 'State Senate'], ['sldl', 'State House'],
  ['subcircuit', 'Judicial subcircuit'], ['commissioner', 'County Board'], ['bor', 'Board of Review'],
  ['police', 'Police district'], ['school', 'School board'],
];
/** A district's number as people know it: precincts are stored "ward-precinct". */
const districtNumber = (k: keyof Districts, v: string) => (k === 'precinct' ? v.split('-')[1] : v);

export function KnowYourBallot() {
  useDocumentMeta('Know Your Ballot: Illinois', '🗳️');
  const [saved, setSaved] = useSaved();
  const browsing = !!saved.browsing;
  const setBrowsing = (on: boolean) => setSaved((s) => ({ ...s, browsing: on || undefined }));
  const [tab, setTab] = useState<'ballot' | 'plan' | 'share'>('ballot');
  // Progress arriving in a #resume link while this device has its own: ask first.
  const [incoming, setIncoming] = useState<Saved | null>(null);
  const [linkMsg, setLinkMsg] = useState('');
  // The ballot before "Change" was tapped, to say exactly what the new address changed.
  const previousPlace = useRef<Saved['place']>(null);
  const [change, setChange] = useState<BallotChange | null>(null);
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<{ busy: boolean; error: string; outside: boolean }>({ busy: false, error: '', outside: false });
  const [sheet, setSheet] = useState<{ race: Race; c: Candidate } | null>(null);
  const [comparing, setComparing] = useState<Race | null>(null);
  // One ballot section on screen at a time; the contents list switches them.
  const [chosenSection, setChosenSection] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const closeContents = useCallback(() => setContentsOpen(false), []);
  // The pinned bar's height, as --kyb-bar, for what has to sit below it.
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((bar: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    const root = document.documentElement;
    if (!bar) { root.style.removeProperty('--kyb-bar'); return; }
    // Setting a variable on the page root makes the browser recheck every
    // element's style, so only when the height really changed (resizing the
    // window or zooming changes the width far more often).
    let last = '';
    barObserver.current = new ResizeObserver(([entry]) => {
      const h = `${Math.round(entry.borderBoxSize?.[0]?.blockSize ?? bar.offsetHeight)}px`;
      if (h !== last) root.style.setProperty('--kyb-bar', (last = h));
    });
    barObserver.current.observe(bar);
  }, []);
  const [toast, setToast] = useState('');
  const [party, setParty] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  // When this device last opened the guide; this visit becomes the new mark.
  const [lastSeen, setLastSeen] = useState(saved.seen);
  // ...and a day on the streak.
  useEffect(() => {
    const d = today();
    setSaved((s) => ({ ...s, seen: new Date().toISOString(), days: s.days?.includes(d) ? s.days : [...(s.days ?? []), d].slice(-30) }));
  }, [setSaved]);

  const districts = saved.place?.districts ?? null;
  // Ballot numbers come from the Chicago Board's list and only match Chicago
  // ballots; suburban ballots number candidates differently.
  const chicago = districts ? inChicago(districts) : true;
  // Outside Cook we carry only statewide, congressional and legislative races.
  const cook = districts ? inCook(districts) : true;
  const clerk = cook ? COOK_CLERK : ELECTION_AUTHORITIES;
  const region = chicago ? 'Chicago' : cook ? 'Cook County' : 'Illinois';
  // The details view has its own URL; with saved progress the first open goes straight there.
  const [showBallot, showView] = useBallotView('know-your-ballot-illinois', !!saved.place || browsing);
  const browse = () => { setBrowsing(true); showView(true); };
  const daysLeft = daysUntil(data.election.date);

  // ---- the voter's ballot and their progress through it --------------------
  const ballot = useMemo(() => ballotFor(data, districts), [districts]);
  const sections = useMemo(() => SECTIONS.map((s) => {
    const ids = s.id === 'retention' ? ballot.retentions.filter((r) => !r.withdrawn).map((r) => r.id)
      : s.id === 'measures' ? ballot.measures.map((m) => m.id)
      : ballot.races.filter((r) => r.section === s.id).map((r) => r.id);
    return { ...s, ids, done: ids.filter((id) => isDecided(saved.picks[id])).length };
  }).filter((s) => s.ids.length), [ballot, saved.picks]);
  // What the daily refresh changed on this ballot since the last visit.
  const updates = useMemo(() => {
    if (!lastSeen) return [];
    const ids = new Set(sections.flatMap((s) => s.ids));
    return (data.changes ?? []).filter((c) => c.at > lastSeen && (ids.has(c.id) || c.id in saved.picks));
  }, [lastSeen, sections, saved.picks]);
  const sectionFor = (id: string) => data.races.find((r) => r.id === id)?.section ?? (data.retentions.some((r) => r.id === id) ? 'retention' : 'measures');
  const total = sections.reduce((n, s) => n + s.ids.length, 0);
  const done = sections.reduce((n, s) => n + s.done, 0);
  const allDone = total > 0 && done === total;

  const choose = useCallback((id: string, c: Choice) => setSaved((s) => {
    // A newly decided race counts toward today's goal.
    const d = today();
    const goal = !isDecided(s.picks[id]) && isDecided(c) ? { day: d, n: (s.goal?.day === d ? s.goal.n : 0) + 1 } : s.goal;
    return { ...s, picks: { ...s.picks, [id]: c }, goal, best: Math.max(s.best ?? 0, goal?.day === d ? goal.n : 0) || undefined };
  }), [setSaved]);
  // Reading up on candidates counts toward the Researcher badge.
  const lookedUp = useCallback(() => setSaved((s) => ({ ...s, looked: (s.looked ?? 0) + 1 })), [setSaved]);
  const openSheet = useCallback((race: Race, c: Candidate) => { setSheet({ race, c }); lookedUp(); }, [lookedUp]);
  const openCompare = useCallback((race: Race) => { setComparing(race); lookedUp(); }, [lookedUp]);
  const setPlan = useCallback((k: string, v: boolean | string) => setSaved((s) => ({ ...s, plan: { ...s.plan, [k]: v } })), [setSaved]);

  // Cheer each section as it's finished, and the whole ballot once.
  const prevDone = useRef<Record<string, boolean> | null>(null);
  const prevDistricts = useRef(districts);
  useEffect(() => {
    const now = Object.fromEntries(sections.map((s) => [s.id, s.done === s.ids.length]));
    const before = prevDone.current;
    prevDone.current = now;
    // A different address is a different ballot: comparing the two would
    // "finish" sections nobody touched.
    const sameBallot = prevDistricts.current === districts;
    prevDistricts.current = districts;
    if (!before || !saved.place || !sameBallot) return;
    if (allDone && !Object.values(before).every(Boolean)) { setParty(true); setToast('🎉 Your whole ballot is ready! Print it or share your progress.'); return; }
    const finished = sections.find((s) => now[s.id] && !before[s.id]);
    if (finished) {
      const left = sections.filter((s) => !now[s.id]).length;
      setToast(`✅ ${finished.title}: done! ${left} section${left === 1 ? '' : 's'} to go.`);
    }
  }, [sections, allDone, saved.place]);

  // The progress game: today's goal, streak and badges.
  const day = today();
  const gameCtx = {
    done, total, allDone, looked: saved.looked ?? 0, plan: saved.plan,
    visits: saved.days?.length ?? 0, streak: streak(saved.days, day), best: saved.best ?? 0,
    hasPlace: !!saved.place, levels: sections,
  };
  const earned = earnedTrophies(gameCtx);
  const earnedIds = earned.map((t) => t.id).join();
  // A new trophy gets a toast; a different address (new levels) or a section
  // finished (which has its own) doesn't count as news.
  const prevEarned = useRef<{ ids: string; districts: Districts | null } | null>(null);
  useEffect(() => {
    const before = prevEarned.current;
    prevEarned.current = { ids: earnedIds, districts };
    if (!before || before.districts !== districts || !saved.place) return;
    const fresh = earned.find((t) => t.id !== 'ready' && !t.id.startsWith('level-') && !before.ids.split(',').includes(t.id));
    if (fresh) setToast(`${fresh.emoji} Trophy unlocked: ${fresh.name}!`);
  }, [earnedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  // Opened from a resume link (or one pasted into this already-open tab, which
  // only changes the #): load it, asking first if this device already has
  // progress, then drop it from the address bar so a reload or a copied URL
  // doesn't carry it along.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    const take = () => {
      if (!location.hash.startsWith('#resume=')) return;
      readResumeLink(location.hash).then((link) => {
        history.replaceState(null, '', location.pathname + location.search);
        if (!link) { setToast('That saved-progress link didn’t work. It may be cut off; try copying it again.'); return; }
        if (hasProgress(savedRef.current)) { setIncoming(link); return; }
        setSaved(link);
      });
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, [setSaved]);

  /** Open a contest's section and bring its card into view. */
  const scrollTo = (el: Element | null) =>
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  /** Show a section (from the top). */
  const openSection = (sectionId: string) => {
    setTab('ballot');
    setChosenSection(sectionId);
    requestAnimationFrame(() => scrollTo(document.getElementById(`sec-${sectionId}`)?.closest('section') ?? null));
  };
  const jumpTo = (sectionId: string, id: string) => {
    setTab('ballot');
    setChosenSection(sectionId);
    // Two frames: the new section has to render, and the pinned bar has to
    // settle (a search just closed its results list) before --kyb-bar, and so
    // where things land, is right.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`race-${id}`);
      // Races sit in their section's own scroll box: bring the whole box into
      // view under the pinned bar, then scroll the race to the top of the box.
      const box = el?.closest<HTMLElement>('.kyb-scroll');
      if (el && box) {
        // The box jumps straight there (two smooth scrolls at once can cancel
        // each other); the page glides.
        box.scrollTop = el.offsetTop - 8;
        scrollTo(box);
      } else scrollTo(el);
      el?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    }));
  };
  // Links from govbot (its search, RSS, the old elections page) name a race
  // by govbot's id: #race=us-house-il-07. Open that race; Feb 2027 races open
  // the 2027 note. Our own ids work too. Then tidy the address bar.
  const raceLink = useRef<() => void>(() => {});
  raceLink.current = () => {
    const m = location.hash.match(/^#(race|office)=([^&]+)/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    const asked = decodeURIComponent(m[2]);
    const id = m[1] === 'race' ? (data.govbot.legacy?.[asked] ?? asked) : null;
    const race = id ? data.races.find((r) => r.id === id) : undefined;
    if (race && districts && !ballotIds(districts).has(race.id)) {
      setToast(`${race.office} isn’t on the ballot at your address. Use the search to see it.`);
      return;
    }
    // Browsing shows Cook County's races; the rest of Illinois needs an address there.
    if (race?.outsideCook && !districts) {
      setToast(`${race.office} is outside Cook County. Enter an address in that district to see it.`);
      return;
    }
    if (!showBallot) browse();
    if (race) jumpTo(race.section, race.id);
    else if (id === '2027') requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(document.getElementById('kyb-next'))));
  };
  useEffect(() => {
    const take = () => raceLink.current();
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, []);
  const nextUp = () => {
    const s = sections.find((sec) => sec.done < sec.ids.length);
    const id = s?.ids.find((i) => !isDecided(saved.picks[i]));
    if (s && id) jumpTo(s.id, id);
  };

  // ---- address -> districts --------------------------------------------------
  const place = async (lat: number, lng: number, label: string) => {
    const d = await districtsAt(lat, lng);
    if (!inIllinois(d)) { setStatus({ busy: false, error: '', outside: true }); return; }
    // A new address means a new ballot. Statewide and countywide contests are
    // the same race at both addresses, so those picks still stand; picks for
    // races that aren't on this ballot (old districts, old ward) are dropped
    // rather than lingering hidden in storage and save links.
    const onBallot = ballotIds(d);
    const decided = (Object.entries(saved.picks) as [string, Choice][]).filter(([, c]) => isDecided(c));
    const old = previousPlace.current?.districts ?? null;
    const oldIds = old ? ballotIds(old) : null;
    const report: BallotChange = {
      districts: old
        ? DISTRICT_CHIPS.filter(([k]) => old[k] !== d[k]).map(([k, label]) => ({ label, from: old[k] && districtNumber(k, old[k]), to: d[k] && districtNumber(k, d[k]) }))
        : [],
      kept: decided.filter(([id]) => onBallot.has(id)).map(([id, c]) => describePick(id, c)),
      cleared: decided.filter(([id]) => !onBallot.has(id)).map(([id, c]) => describePick(id, c)),
      added: old ? [...onBallot].filter((id) => !oldIds?.has(id)).map((id) => describePick(id, undefined).what) : [],
    };
    previousPlace.current = null;
    setSaved((s) => ({ ...s, place: { label, districts: d }, picks: Object.fromEntries(Object.entries(s.picks).filter(([id]) => onBallot.has(id))) }));
    setChange(report.districts.length || report.cleared.length || report.kept.length ? report : null);
    setStatus({ busy: false, error: '', outside: false });
    setBrowsing(false);
    showView(true);
    window.scrollTo({ top: 0 });
  };
  const lookUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!address.trim() || status.busy) return;
    setStatus({ busy: true, error: '', outside: false });
    try {
      const hit = await geocode(address.trim());
      if (!hit) { setStatus({ busy: false, error: 'We couldn’t find that address in Illinois. Try the street number, name and town, like “1501 Sherman Ave, Evanston”.', outside: false }); return; }
      await place(hit.lat, hit.lng, hit.label);
    } catch {
      setStatus({ busy: false, error: 'The address search didn’t answer. Check your connection, or use your location instead.', outside: false });
    }
  };
  const useLocation = () => {
    if (!navigator.geolocation) { setStatus({ busy: false, error: 'This browser can’t share your location. Type your address instead.', outside: false }); return; }
    setStatus({ busy: true, error: '', outside: false });
    navigator.geolocation.getCurrentPosition(
      (p) => { place(p.coords.latitude, p.coords.longitude, 'Your current location').catch(() => setStatus({ busy: false, error: 'Something went wrong. Try typing your address.', outside: false })); },
      () => setStatus({ busy: false, error: 'Location wasn’t shared. Type your address instead.', outside: false }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const saveLink = async (send: boolean) => {
    setLinkMsg('');
    // Same site the voter is on (also right for previews and local runs).
    const url = await resumeLink(saved, `${location.origin}${import.meta.env.BASE_URL}projects/know-your-ballot-illinois`);
    try {
      if (send && navigator.share) { await navigator.share({ title: 'My ballot progress', url }); setPlan('shared', true); return; }
      await navigator.clipboard.writeText(url);
      setLinkMsg('Link copied. Paste it somewhere safe, like a note or a text to yourself.');
      setPlan('shared', true);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLinkMsg('Couldn’t copy automatically on this device. Try “Send it to myself”.');
    }
  };

  // Back to the address screen. Picks stay saved; races that are on both the
  // old and new ballot keep their picks.
  const changeAddress = () => {
    previousPlace.current = saved.place;
    setChange(null);
    setSaved((s) => ({ ...s, place: null, browsing: undefined }));
    setTab('ballot');
    showView(false);
    window.scrollTo({ top: 0 });
  };

  const doShare = async () => {
    setShareMsg('');
    try {
      const blob = await drawShareCard({
        done, total, daysLeft, url: SHARE_URL, place: region,
        sections: sections.map((s) => ({ title: s.title, color: cssColor(s.color), done: s.done, total: s.ids.length })),
      });
      setPlan('shared', true);
      setShareMsg((await shareCard(blob, SHARE_URL)) === 'downloaded' ? 'Saved the image: post it anywhere.' : 'Thanks for spreading the word!');
    } catch {
      setShareMsg('Couldn’t make the image on this device.');
    }
  };

  const raceById = useMemo(() => new Map(data.races.map((r) => [r.id, r])), []);
  // The section on screen: the one chosen, else the first with races left.
  const current = sections.find((s) => s.id === chosenSection)?.id ?? (sections.find((s) => s.done < s.ids.length) ?? sections[0])?.id ?? null;
  const contents = {
    sections, current,
    isDone: (id: string) => isDecided(saved.picks[id]),
    labelOf: (id: string) => raceById.get(id)?.office ?? describePick(id, undefined).what,
    onSection: openSection,
    onRace: jumpTo,
  };
  const sectionOf = (id: string) => SECTIONS.find((s) => s.id === id)!;
  const picksFor = (id: string) => { const c = saved.picks[id]; return Array.isArray(c) ? c : []; };

  // ---- screens ------------------------------------------------------------------
  // The three views. On phones, while the browsing notice is up, they scroll
  // away with the page instead of sitting in the sticky bar.
  const views = ([['ballot', 'My Ballot'], ['plan', 'Plan to vote'], ['share', 'Save & share']] as const).map(([id, label]) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}
      className={`min-h-[44px] rounded-xl font-bold border-2 border-[var(--gb-text)] ${tab === id ? 'bg-[var(--gb-text)] text-[var(--gb-bg)]' : 'text-[var(--gb-text)]'}`}>
      {label}
    </button>
  ));

  return (
    <ReadOnlyContext.Provider value={!saved.place}>
    <GovbotChrome>
    <div className="kyb min-h-[100dvh] bg-[var(--gb-bg)] text-[var(--gb-text)] selection:bg-[var(--gb-blue-hi)] selection:text-[var(--gb-bg)]">
      <GaugeDefs />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-24 print:hidden">
        {!showBallot ? (
          <Landing
            address={address} setAddress={setAddress} status={status} onSubmit={lookUp} onLocate={useLocation}
            daysLeft={daysLeft}
            onBrowse={() => { browse(); window.scrollTo({ top: 0 }); }}
            onSearchJump={(h) => { browse(); jumpTo(h.section, h.id); }}
            onOpenRace={(race) => { browse(); jumpTo(race.section, race.id); }}
            onOpenCandidate={openSheet}
            onOpenSection={(sectionId, id) => { browse(); jumpTo(sectionId, id); }}
            place={saved.place?.label} onContinue={() => showView(true)}
            saved={Object.keys(saved.picks).length}
            onStartFresh={() => { setSaved((s) => ({ ...s, picks: {}, plan: {} })); setToast('Cleared. Starting fresh.'); }}
          />
        ) : (
          <>
            {/* Progress, views and search, pinned under govbot's header all the
                way down the page (its height feeds --kyb-bar, so the contents
                column and jumped-to races sit just below it). */}
            <div ref={barRef} className="sticky top-[var(--kyb-top)] z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 bg-[var(--gb-bg)] border-b border-[var(--gb-border)]">
            <div className="max-w-[1100px] mx-auto">
              <div className="flex items-center gap-2 sm:gap-4">
                <button type="button" onClick={() => setContentsOpen(true)} aria-label="Contents"
                  className="lg:hidden shrink-0 w-11 h-11 rounded-xl border-2 border-[var(--gb-border)] flex items-center justify-center text-[var(--gb-text)] hover:border-[var(--gb-text)]">
                  <ListChecks className="w-5 h-5" aria-hidden="true" />
                </button>
                <Ring pct={total ? done / total : 0} />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-lg leading-tight">{!saved.place ? `${total} contests to browse` : allDone ? 'Ballot ready 🎉' : `${done} of ${total} decided`}</p>
                  <button type="button" onClick={changeAddress} className="flex max-w-full items-center gap-1.5 text-sm text-[var(--gb-text)] hover:text-[var(--gb-text)]">
                    <span className="truncate">{saved.place ? `📍 ${saved.place.label}` : 'Browsing every race'}</span>
                    <span className="shrink-0 font-bold text-[var(--gb-text)] underline underline-offset-2">{saved.place ? 'Change' : 'Add address'}</span>
                  </button>
                </div>
              </div>
              <div className={`mt-3 grid-cols-3 gap-2 ${saved.place ? 'grid' : 'hidden lg:grid'}`}>{views}</div>
              {/* Search stays in reach while scrolling. */}
              <div className="mt-3">
                <BallotSearch ballot={ballot} everywhere={districts ? everything : undefined} sections={SECTION_TITLES} places={data.places} onJump={(h) => jumpTo(h.section, h.id)} />
              </div>
              {!saved.place && <BrowsingNotice region="Chicago or suburban Cook" onAddAddress={changeAddress} />}
            </div>
            </div>
            {!saved.place && <div className="lg:hidden grid grid-cols-3 gap-2 pt-3 max-w-[1100px] mx-auto">{views}</div>}
            <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start max-w-[1100px] mx-auto pt-4">
            <ContentsColumn {...contents} />
            {/* In the drawer a section just opens its list; the page moves when a race is picked. */}
            <ContentsDrawer {...contents} onSection={(id) => { setTab('ballot'); setChosenSection(id); }} open={contentsOpen} onClose={closeContents} />
            <div className="min-w-0 max-w-3xl">

            {tab === 'ballot' && (
              <div className="space-y-8 pt-6">
                {incoming && (
                  <div role="alertdialog" aria-label="Load saved progress?" className="rounded-2xl border-2 border-[var(--gb-blue-hi)] bg-[var(--gb-surface)] p-4 space-y-3">
                    <p className="font-black">Load progress from your saved link?</p>
                    <p className="text-[15px] text-[var(--gb-text)]">It has {Object.keys(incoming.picks).length} decisions. This device has {Object.keys(saved.picks).length}. Loading replaces what’s here.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setSaved(incoming); setIncoming(null); }} className="min-h-[44px] rounded-xl bg-[var(--gb-blue-hi)] px-4 font-black text-[var(--gb-bg)]">Load my saved link</button>
                      <button type="button" onClick={() => setIncoming(null)} className="min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">Keep this device’s</button>
                    </div>
                  </div>
                )}
                {change && <ChangeReport change={change} onDismiss={() => setChange(null)} onNext={() => { setChange(null); nextUp(); }} />}
                {updates.length > 0 && <SinceLastVisit changes={updates} since={lastSeen!} picks={saved.picks} onJump={(id) => jumpTo(sectionFor(id), id)} onDismiss={() => setLastSeen(undefined)} />}
                {total > 0 && saved.place && <Trophies ctx={gameCtx} />}
                <WhereYouVote districts={districts} chicago={chicago} cook={cook} onChange={changeAddress} />
                <HowBallotWorks storageKey="kyb-il-how-open" title="How an Illinois ballot works">
                  <p><strong>Three parts.</strong> Candidates by office, in the order the Board of Elections sets (federal first, then state, county, judges and school board); the judges up for retention; then the referenda.</p>
                  <p><strong>No straight-party box.</strong> Illinois dropped it: every race is marked on its own.</p>
                  <p><strong>Ballot numbers.</strong> On a Chicago ballot each candidate has a number; the print view lists them so you can find names fast in the booth. Suburban Cook ballots order candidates differently.</p>
                  <p><strong>“Vote for not more than N.”</strong> Some contests (the Water Reclamation District, some judicial vacancies) fill several seats at once; pick up to that many.</p>
                  <p><strong>Keep these judges?</strong> Retention is a yes or no on each sitting judge, with no opponent; a judge stays with at least 60% yes.</p>
                  <p><strong>Referenda.</strong> Yes or no on each question; which ones you see depends on your ward or precinct.</p>
                </HowBallotWorks>
                <Feed storageKey="kyb-il-feed-open" onJump={(id) => jumpTo(sectionFor(id), id)} items={[
                  ...changeItems(data.changes ?? [], (c) => (c.kind === 'money'
                    ? { name: 'FEC and Illinois State Board of Elections filings', url: data.sources.money.url }
                    : { name: 'Chicago Board of Elections candidate list', url: data.sources.candidates.page })),
                  ...newsItems(data.news ?? []),
                  ...billItems(data.govbot.laws, billUrl, 'Illinois General Assembly'),
                  ...dateItems(forVoter(NOV_3, chicago), today(), chicago ? { name: 'Chicago Board of Elections', url: LINKS.myInfo } : { name: 'Illinois State Board of Elections', url: LINKS.stateLookup }),
                ]} />
                <Laws laws={data.govbot.laws} state={{ code: 'IL', name: 'Illinois', capital: 'Springfield', rss: 'https://chihacknight.github.io/govbot/dashboard/elections/springfield.xml' }} />
                <NextElectionNote chicago={districts ? chicago : undefined} city={data.govbot.city} districts={districts} />

                {sections.filter((s) => s.id === current).map((s) => {
                  const at = sections.indexOf(s);
                  const next = sections[at + 1];
                  return (
                    <section key={s.id} aria-labelledby={`sec-${s.id}`} className="space-y-4 scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)]">
                      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: s.color, color: s.ink }}>
                        <span className="text-2xl" aria-hidden="true">{s.emoji}</span>
                        <h2 id={`sec-${s.id}`} className="flex-1 text-xl">
                          <span className="block text-xs font-bold uppercase tracking-[0.18em]">Level {at + 1} of {sections.length}</span>
                          {s.title}
                        </h2>
                        <span className="rounded-full bg-[var(--gb-bg)] px-3 py-1 text-sm font-black text-[var(--gb-text)]">{s.done}/{s.ids.length}</span>
                      </div>

                      {s.id === 'retention' && (
                        <div className="space-y-3">
                          <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">{RETENTION_EXPLAINER} Each card shows how Chicago-area bar associations rate that judge.</p>
                          <button type="button" onClick={() => setSaved((sv) => ({ ...sv, picks: { ...sv.picks, ...Object.fromEntries(s.ids.filter((id) => !isDecided(sv.picks[id])).map((id) => [id, 'skip' as Choice])) } }))}
                            className="min-h-[44px] rounded-xl border-2 border-[var(--gb-border)] px-4 font-bold text-[var(--gb-text)] hover:border-[var(--gb-text)]">
                            Skip the ones I haven’t answered
                          </button>
                        </div>
                      )}
                      {/* The section's races scroll in their own box (scrollbar in the
                          section's colour), so a long section doesn't stretch the page. */}
                      <div className="kyb-scroll" style={{ ['--scroll' as string]: s.color }}>
                        {s.id === 'retention' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {ballot.retentions.map((r) => <RetentionCard key={r.id} color={s.color} r={r} choice={saved.picks[r.id]} onChoose={choose} />)}
                          </div>
                        )}
                        {s.id === 'measures' && ballot.measures.map((m) => <MeasureCard key={m.id} color={s.color} m={m} choice={saved.picks[m.id]} onChoose={choose} />)}
                        {s.id !== 'retention' && s.id !== 'measures' && s.ids.map((id) => {
                          const race = raceById.get(id)!;
                          return (
                            <RaceCard key={id} race={race} color={s.color} ink={s.ink} numbered={chicago && race.numbered !== false} choice={saved.picks[id]}
                              onChoose={choose} onInfo={openSheet} onCompare={openCompare} />
                          );
                        })}
                      </div>

                      {next ? (
                        <button type="button" onClick={() => openSection(next.id)} className="w-full flex items-center justify-between gap-3 min-h-[56px] rounded-2xl px-5 font-black text-lg" style={{ background: next.color, color: next.ink }}>
                          <span>Next: {next.emoji} {next.title}</span><span aria-hidden="true">→</span>
                        </button>
                      ) : (
                        <p className="rounded-2xl border border-[var(--gb-border)] p-4 font-bold">That’s the last section. {allDone ? 'Your ballot is ready to print or share. 🎉' : 'Use the contents or “Next up” to find any races left.'}</p>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            {tab === 'plan' && (
              <div className="pt-6 space-y-6">
                <PlanToVote plan={saved.plan} setPlan={setPlan} chicago={chicago} clerk={clerk} clerkName={cook ? 'the Cook County Clerk' : 'your county clerk'} ward={districts?.ward}
                  wardSite={districts?.ward ? data.earlyVotingSites[districts.ward] : undefined}
                  ballotDone={allDone} />
                <KeyDates chicago={chicago} info={chicago ? LINKS.myInfo : clerk} />
                <button type="button" onClick={() => window.print()} className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-[var(--gb-text)] font-black text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
                  <Printer className="w-5 h-5" aria-hidden="true" /> Print My Ballot
                </button>
              </div>
            )}

            {tab === 'share' && (
              <div className="pt-6 space-y-5">
                <section className="rounded-2xl border-2 border-[var(--gb-blue-hi)] bg-[var(--gb-surface)] p-5 space-y-3" aria-labelledby="kyb-keep">
                  <h2 id="kyb-keep" className="text-2xl font-black leading-tight">💾 Keep your progress</h2>
                  <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">Your picks save on this device automatically. To pick up on another phone or computer, or in case your browser clears its data, save a link: opening it brings everything back.</p>
                  <div className="flex flex-wrap gap-2">
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button type="button" onClick={() => saveLink(true)} className="min-h-[48px] rounded-xl bg-[var(--gb-blue-hi)] px-4 font-black text-[var(--gb-bg)]">Send it to myself</button>
                    )}
                    <button type="button" onClick={() => saveLink(false)} className="min-h-[48px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">Copy my link</button>
                  </div>
                  {linkMsg && <p role="status" className="font-bold">{linkMsg}</p>}
                  <p className="text-sm text-[var(--gb-text)]">🔒 The link holds your picks and districts, not your street address. Keep it to yourself.</p>
                </section>
                <h2 className="text-2xl font-black leading-tight">Get your people to look up theirs</h2>
                <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">Share a card with your progress: how many races you’ve researched, section by section. <strong className="text-[var(--gb-text)]">It never shows who you picked.</strong></p>
                <div className="rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-5 space-y-3">
                  {sections.map((s) => (
                    <div key={s.id}>
                      <div className="flex justify-between font-bold"><span>{s.title}</span><span>{s.done}/{s.ids.length}</span></div>
                      <div className="h-3 rounded-full bg-[var(--kyb-chip)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.done / s.ids.length) * 100}%`, background: s.color }} /></div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={doShare} className="w-full inline-flex items-center justify-center gap-2 min-h-[56px] rounded-xl bg-[var(--gb-amber-hi)] font-black text-lg text-[var(--gb-bg)]">
                  <Share2 className="w-5 h-5" aria-hidden="true" /> Share my progress
                </button>
                {shareMsg && <p role="status" className="font-bold text-center">{shareMsg}</p>}
              </div>
            )}
            </div>
            </div>
          </>
        )}

        {/* Always last, above the footer, on every screen. */}
        <div className="max-w-[1100px] mx-auto mt-12 space-y-8">
          <Sources />
        </div>
      </div>

      {/* Print view: the voter's picks, in ballot order, to take into the booth. */}
      <PrintBallot sections={sections} picks={saved.picks} label={saved.place?.label} numbered={chicago} region={region} />

      {sheet && (
        <CandidateSheet race={sheet.race} c={sheet.c} color={sectionOf(sheet.race.section).color} ink={sectionOf(sheet.race.section).ink} numbered={chicago && sheet.race.numbered !== false}
          picked={picksFor(sheet.race.id).includes(sheet.c.ballot)}
          onPick={() => {
            const cur = picksFor(sheet.race.id);
            const has = cur.includes(sheet.c.ballot);
            const next = has ? cur.filter((b) => b !== sheet.c.ballot) : sheet.race.voteFor === 1 ? [sheet.c.ballot] : [...cur, sheet.c.ballot].slice(-sheet.race.voteFor);
            choose(sheet.race.id, next);
          }}
          onShowRace={showBallot ? undefined : () => { const race = sheet.race; setSheet(null); browse(); jumpTo(race.section, race.id); }}
          onClose={() => setSheet(null)} />
      )}
      {comparing && (
        <Compare race={comparing} color={sectionOf(comparing.section).color} ink={sectionOf(comparing.section).ink} numbered={chicago && comparing.numbered !== false} picked={picksFor(comparing.id)}
          onInfo={(c) => { const race = comparing; setComparing(null); openSheet(race, c); }}
          onPick={(b) => {
            const cur = picksFor(comparing.id);
            choose(comparing.id, cur.includes(b) ? cur.filter((x) => x !== b) : comparing.voteFor === 1 ? [b] : [...cur, b].slice(-comparing.voteFor));
          }}
          onClose={() => setComparing(null)} />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 inset-x-4 z-[55] mx-auto max-w-md rounded-2xl bg-[var(--gb-text)] px-5 py-4 text-center font-black text-[var(--gb-bg)] shadow-2xl print:hidden">{toast}</div>
      )}
      {party && <Confetti onDone={() => setParty(false)} />}
    </div>
    </GovbotChrome>
    </ReadOnlyContext.Provider>
  );
}

// ---- pieces ------------------------------------------------------------------------

/** Illinois in govbot's blues and primary green, pinned in gold. */
const IL_MAP = { fill: ['var(--gb-blue-hi)', 'var(--gb-primary)', 'var(--gb-blue)'] as [string, string, string], stroke: 'var(--kyb-gold)', pin: 'var(--kyb-gold)', pinStroke: 'var(--gb-bg)' };

function Landing({ address, setAddress, status, onSubmit, onLocate, onBrowse, onSearchJump, onOpenRace, onOpenCandidate, onOpenSection, place, onContinue, daysLeft, saved, onStartFresh }: {
  address: string; setAddress: (s: string) => void; status: { busy: boolean; error: string; outside: boolean };
  onSubmit: (e: FormEvent) => void; onLocate: () => void; onBrowse: () => void; onSearchJump: (h: Hit) => void; onOpenRace: (r: Race) => void; onOpenCandidate: (r: Race, c: Candidate) => void;
  onOpenSection: (sectionId: string, id: string) => void; /** A saved ballot to go back to. */ place?: string; onContinue: () => void; daysLeft: number;
  /** Picks already saved on this device. */
  saved: number; onStartFresh: () => void;
}) {
  // Spins while the browser finds you and the lookup runs.
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (!status.busy) setLocating(false); }, [status.busy]);
  // Two taps: wiping someone's picks shouldn't be one slip of the thumb.
  const [confirming, setConfirming] = useState(false);
  const candidates = data.races.reduce((n, r) => n + r.candidates.length, 0);
  // Fetch the district maps while the voter types, so "Find my ballot"
  // doesn't wait on a download, but once the page is idle, so reading them
  // doesn't stall the first taps.
  useEffect(() => {
    if (!('requestIdleCallback' in window)) { const t = setTimeout(prefetchDistricts, 1500); return () => clearTimeout(t); }
    const id = requestIdleCallback(() => { prefetchDistricts(); }, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }, []);
  return (
    <div className="space-y-8 pt-2 [&>*:not(header,.kyb-wide)]:max-w-3xl">
      <header className="flex flex-col-reverse md:flex-row md:items-center gap-4 md:gap-10">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em]">Illinois · 2026 midterms</p>
          <h1 className="text-[40px] sm:text-5xl leading-[1.02]">Know Your Illinois Ballot</h1>
          <p className="font-[family-name:var(--gb-font-display)] text-xl">Every race on your ballot, explained before you vote.</p>
          <p className="font-semibold">
            Election Day: Tue, Nov 3, 2026{daysLeft > 0 ? <> · <span className="rounded-full bg-[var(--gb-primary)] px-2.5 py-0.5 font-bold text-[var(--gb-on-primary)]">{daysLeft} days to go</span></> : daysLeft === 0 ? ' · Today!' : ''}
          </p>
          <ul className="space-y-1 text-[15px] leading-relaxed max-w-[62ch]" aria-label="What you’ll vote on">
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Governor and every statewide office</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>A U.S. Senate seat and your U.S. House seat</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Your seats in the Illinois House and Senate</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Cook County’s top jobs: board president, assessor, clerk, sheriff, treasurer and your commissioner</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Judges to elect, and sitting judges to keep or let go</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Your Chicago school board seat</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Ballot questions, from countywide down to your precinct</span></li>
          </ul>
        </div>
        <div className="w-[190px] md:w-[300px] md:max-w-[36%] shrink-0 self-center"><StateMap outline={outline as Outline} name="Illinois" colors={IL_MAP} id="il" /></div>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="kyb-address" className="block font-black text-lg">Your address in Illinois</label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--gb-text)] pointer-events-none" aria-hidden="true" />
            <input id="kyb-address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 121 N LaSalle St or 1501 Sherman Ave, Evanston"
              className="w-full min-h-[56px] rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] pl-12 pr-12 text-lg font-bold text-[var(--gb-text)] focus:border-[var(--gb-blue-hi)] focus:outline-none" />
            {address && <ClearButton onClear={() => setAddress('')} className="right-2 text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]" />}
          </div>
          <button type="submit" disabled={status.busy} className="shrink-0 min-h-[56px] rounded-2xl bg-[var(--gb-blue-hi)] px-5 font-black text-[var(--gb-bg)] disabled:cursor-wait inline-flex items-center gap-2">
            <Search className="w-5 h-5" aria-hidden="true" /><span className="hidden sm:inline">{status.busy ? 'Finding…' : 'Find my ballot'}</span><span className="sm:hidden">{status.busy ? '…' : 'Go'}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="button" onClick={() => { setLocating(true); onLocate(); }} disabled={status.busy} aria-busy={locating} className="inline-flex items-center gap-2 min-h-[44px] font-bold text-[var(--gb-text)] underline underline-offset-4 disabled:cursor-wait">
            {locating ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Crosshair className="w-5 h-5" aria-hidden="true" />} {locating ? 'Finding where you are…' : 'Use my current location'}
          </button>
          <button type="button" onClick={onBrowse} className="inline-flex items-center gap-2 min-h-[44px] font-bold underline underline-offset-4">
            <ListChecks className="w-5 h-5" aria-hidden="true" /> No address? Browse every race
          </button>
        </div>
        {place && <ContinueCard label={place} onContinue={onContinue} />}
        {status.error && <p role="alert" className="rounded-xl bg-[var(--gb-red)] px-4 py-3 font-bold text-white">{status.error}</p>}
        {status.outside && (
          <p role="alert" className="rounded-xl bg-[var(--kyb-chip)] border-2 border-[var(--gb-amber-hi)] px-4 py-3 font-bold">
            That address is outside Illinois. This guide covers Illinois voters. Illinois voters away from home can look up their registration and polling place with the <a className="underline text-[var(--gb-amber-hi)]" href={LINKS.stateLookup} target="_blank" rel="noreferrer noopener">State Board of Elections ↗</a>.
          </p>
        )}
        {saved > 0 && (
          <div className="rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-3 space-y-2">
            <p className="text-[15px]">You have <strong>{saved} pick{saved === 1 ? '' : 's'}</strong> saved. Same voter, new address? Races on both ballots keep their picks. Looking up someone else’s ballot? Start fresh.</p>
            <button type="button" onClick={() => { if (confirming) { onStartFresh(); setConfirming(false); } else setConfirming(true); }}
              className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${confirming ? 'border-[var(--gb-red)] bg-[var(--gb-red)] text-white' : 'border-[var(--gb-text)] text-[var(--gb-text)]'}`}>
              {confirming ? `Tap again to clear ${saved} pick${saved === 1 ? '' : 's'} and your plan` : 'Start fresh'}
            </button>
          </div>
        )}
        <p className="text-sm leading-relaxed text-[var(--gb-text)]">🔒 Your address goes once to Cook County’s address lookup (or OpenStreetMap, for the rest of Illinois or if the county’s is down) to find your districts. It’s saved only on your device, and never shared or stored anywhere.</p>
      </form>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [data.races.length, 'races in Illinois'], [candidates, 'candidates'],
          [data.retentions.filter((r) => !r.withdrawn).length, 'judges up for retention'], [data.measures.length, 'ballot questions'],
        ].map(([n, label]) => (
          <li key={label} className="rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-4">
            <span className="block text-3xl font-black">{n}</span>
            <span className="block text-sm font-bold text-[var(--gb-text)]">{label}</span>
          </li>
        ))}
      </ul>

      <BallotSearch ballot={everything} sections={SECTION_TITLES} onJump={onSearchJump} />

      <div className="kyb-wide pt-4">
        <Headliners races={STATEWIDE} sections={SECTIONS} overline="On every Illinois ballot" heading="The statewide races"
          intro={`These ${STATEWIDE.length} contests are on every ballot in Illinois. Tap a card to meet the candidates; your address adds Congress, Springfield, Cook County, the judges and your ballot questions.`}
          onOpen={onOpenCandidate} onOpenRace={onOpenRace} />
        <div className="mt-10">
          <SectionCards cards={MORE} heading="Everything else on your ballot" intro="By district, ward or precinct: your address picks out yours. Tap a section to see every contest in it, who’s running and where." onOpen={onOpenCandidate} onOpenRace={onOpenRace} onJump={onOpenSection} />
        </div>
      </div>
    </div>
  );
}

// Suburban contests from the Cook County Clerk (county board districts the
// Chicago list doesn't reach, and suburban referenda) aren't loaded yet; say
// exactly what's missing for this address rather than leaving it silent.
function suburbanGaps(d: Districts): string[] {
  const gaps = [];
  if (d.commissioner && !data.races.some((r) => r.area?.type === 'commissioner' && r.area.id === d.commissioner)) {
    gaps.push(`County Board District ${d.commissioner}`);
  }
  gaps.push('local referenda (school, village, township and park questions)');
  return gaps;
}

function ChangeReport({ change, onDismiss, onNext }: { change: BallotChange; onDismiss: () => void; onNext: () => void }) {
  const row = (x: { what: string; pick: string }) => (
    <li key={x.what} className="flex flex-wrap justify-between gap-x-3"><span>{x.what}</span><strong className="text-[var(--gb-text)]">{x.pick}</strong></li>
  );
  return (
    <section aria-labelledby="kyb-change" className="rounded-2xl border-2 border-[var(--gb-blue-hi)] bg-[var(--gb-surface)] p-4 space-y-4 text-[15px] leading-relaxed text-[var(--gb-text)]">
      <h2 id="kyb-change" className="text-lg font-black text-[var(--gb-text)]">📍 Your ballot changed with your address</h2>
      {change.districts.length > 0 && (
        <div>
          <p className="font-black text-[var(--gb-text)]">Your districts</p>
          <ul className="space-y-0.5">
            {change.districts.map((x) => (
              <li key={x.label}>{x.label}: {x.from ?? 'none'} → <strong className="text-[var(--gb-text)]">{x.to ?? (x.label === 'Ward' ? 'none (outside Chicago)' : 'none')}</strong></li>
            ))}
          </ul>
        </div>
      )}
      {change.kept.length > 0 && (
        <div>
          <p className="font-black text-[var(--gb-primary)]">✓ Kept {change.kept.length} pick{change.kept.length === 1 ? '' : 's'}: same race on both ballots</p>
          <ul className="space-y-0.5">{change.kept.map(row)}</ul>
        </div>
      )}
      {change.cleared.length > 0 && (
        <div>
          <p className="font-black text-[var(--gb-red)]">✕ Cleared {change.cleared.length} pick{change.cleared.length === 1 ? '' : 's'}: not on your new ballot</p>
          <ul className="space-y-0.5">{change.cleared.map(row)}</ul>
        </div>
      )}
      {change.added.length > 0 && (
        <div>
          <p className="font-black text-[var(--gb-amber-hi)]">＋ New on this ballot: {change.added.length} race{change.added.length === 1 ? '' : 's'} to decide</p>
          <ul className="space-y-0.5">
            {change.added.slice(0, 6).map((what) => <li key={what}>{what}</li>)}
            {change.added.length > 6 && <li>and {change.added.length - 6} more</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onNext} className="min-h-[44px] rounded-xl bg-[var(--gb-blue-hi)] px-4 font-black text-[var(--gb-bg)]">Go to what’s left →</button>
        <button type="button" onClick={onDismiss} className="min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold text-[var(--gb-text)]">Got it</button>
      </div>
    </section>
  );
}

function WhereYouVote({ districts, chicago, cook, onChange }: { districts: Districts | null; chicago: boolean; cook: boolean; onChange: () => void }) {
  if (!districts) return null;
  return (
    <div className="rounded-2xl border-[3px] border-[var(--gb-primary)] bg-[var(--gb-surface)] p-4 space-y-3">
      {districts ? (
        <>
          <p className="font-black">Your districts</p>
          <ul className="flex flex-wrap gap-2">
            {DISTRICT_CHIPS.filter(([k]) => districts[k]).map(([k, label]) => (
              <li key={k} className="rounded-full border-[3px] border-[var(--gb-primary)] bg-[var(--kyb-chip)] px-3 py-1 text-sm font-bold">{label} {districtNumber(k, districts[k]!)}</li>
            ))}
          </ul>
          {!cook && (
            <div className="rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--kyb-chip)] p-3 text-[15px] leading-relaxed">
              <p className="font-black text-[var(--gb-amber-hi)]">Outside Cook County: the races everyone in Illinois shares, plus yours in Congress and Springfield</p>
              <p>Your county’s offices, judges and ballot questions aren’t in here. Ballot numbers aren’t shown because each county orders candidates its own way. Your county clerk has your full sample ballot: <a className="font-bold underline text-[var(--gb-text)]" href={ELECTION_AUTHORITIES} target="_blank" rel="noreferrer noopener">find your county clerk ↗</a>. You can also <a className="font-bold underline text-[var(--gb-text)]" href={GOVBOT_ALL_RACES} target="_blank" rel="noreferrer noopener">browse every Illinois race on govbot ↗</a>.</p>
            </div>
          )}
          {cook && !chicago && (
            <div className="rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--kyb-chip)] p-3 text-[15px] leading-relaxed">
              <p className="font-black text-[var(--gb-amber-hi)]">Suburban Cook: a few things aren’t in here yet</p>
              <p>Not included: {suburbanGaps(districts).join(' and ')}. Ballot numbers aren’t shown because suburban ballots order candidates differently. See your full sample ballot at the <a className="font-bold underline text-[var(--gb-text)]" href={COOK_CLERK} target="_blank" rel="noreferrer noopener">Cook County Clerk ↗</a>.</p>
            </div>
          )}
          <p className="text-sm text-[var(--gb-text)]">
            Not right? Check the <a className="font-bold underline text-[var(--gb-text)]" href={chicago ? LINKS.addressLookup : LINKS.stateLookup} target="_blank" rel="noreferrer noopener">official address lookup ↗</a> or{' '}
            <button type="button" onClick={onChange} className="font-bold underline text-[var(--gb-text)]">change your address</button>.
          </p>
        </>
      ) : null}
    </div>
  );
}

// Where every piece comes from, as a cabinet of sources: what each one owns,
// how fresh it is, and a link to check it.
function Sources() {
  const s = data.sources;
  const [open, toggle] = useOpen('kyb-sources-open');
  const cards: { emoji: string; title: string; status: string; planned?: boolean; body: string; links: [string, string][] }[] = [
    { emoji: '🗳️', title: 'Chicago candidates & questions', status: 'Live · official ballot order',
      body: `Every Chicago contest, candidate and ballot question from the Board of Elections’ certified list${s.candidates.asOf ? `, as of ${s.candidates.asOf}` : ''}.`,
      links: [['chicagoelections.gov', s.candidates.page]] },
    { emoji: '🏛️', title: 'Statewide & suburban candidates', status: 'Live · daily',
      body: 'Congressional, legislative and suburban Cook contests across Illinois, plus candidates’ own campaign websites, from the State Board’s certified list.',
      links: [['elections.il.gov', s.stateCandidates.url]] },
    { emoji: '💵', title: 'Campaign money', status: 'Live · when a committee matches',
      body: 'Raised, spent and cash on hand from each campaign’s latest report: FEC for federal races, State Board D-2 reports for the rest. Attached only on a confident match.',
      links: [['FEC data', s.money.url], ['State Board files', s.stateMoney.url]] },
    { emoji: '📣', title: 'Social media & websites', status: 'Live · daily',
      body: 'Only accounts that are the candidate’s own: Congress’s official list, Wikidata (through their exact Wikipedia page), and the links on their own campaign site when the account carries their name.',
      links: [['Congress list', 'https://github.com/unitedstates/congress-legislators'], ['Open States', 'https://openstates.org/il/']] },
    { emoji: '📷', title: 'Candidate photos', status: 'Live · daily',
      body: 'Official photos from government sites (Congress, the General Assembly, Cook County, the school board and more), freely licensed Wikimedia Commons photos, and the headshot on a candidate’s own campaign site. Each is checked to be that person and credited on their card; everyone else shows their initials.',
      links: [['Congress portraits', 'https://github.com/unitedstates/images'], ['Wikimedia Commons', 'https://commons.wikimedia.org/']] },
    { emoji: '⚖️', title: 'Judges', status: 'Live · daily',
      body: 'Each bar group’s rating of every judge and judicial candidate, from the Alliance of Bar Associations for Judicial Screening (and the Chicago Bar Association’s, via Injustice Watch), plus a link to each judge’s Injustice Watch profile. The guide also tells us when a judge withdraws after the ballot is printed.',
      links: [['Bar ratings', 'https://www.voteforjudges.org/'], ['Injustice Watch guide', 'https://2026retention.injusticewatch.org/']] },
    { emoji: '🗺️', title: 'District maps', status: 'Live',
      body: 'Census (Congress, Springfield), Cook County (County Board, Board of Review, judicial subcircuits), City of Chicago (wards, police districts, and your precinct, looked up live) and the Illinois Senate (school board).',
      links: [['data.cityofchicago.org', 'https://data.cityofchicago.org/']] },
    { emoji: '📜', title: 'Springfield bills & 2027 races', status: 'Live · from govbot',
      body: 'Illinois bills on elections and schools, ILGA hearings, and Chicago’s Feb 23, 2027 races with sitting alderpersons, from govbot’s open data.',
      links: [['govbot on GitHub', 'https://github.com/chihacknight/govbot']] },
    { emoji: '📍', title: 'Early voting sites', status: 'Live · Chicago',
      body: 'Each ward’s early voting site and hours, from the Board of Elections. Suburban sites come from the Cook County Clerk.',
      links: [['Chicago sites', s.earlyVoting.page], ['Cook County Clerk', COOK_CLERK]] },
    { emoji: '🔄', title: 'What changed', status: 'Daily',
      body: 'Every morning the guide re-checks its sources and notes candidates added or dropped and new money reports, so returning voters see what’s new.',
      links: [] },
    { emoji: '⏳', title: 'Not here yet', status: 'Planned', planned: true,
      body: 'Judges and county or local offices outside Cook County, and suburban ballot order. Your county clerk’s sample ballot has them.',
      links: [['Find your county clerk', ELECTION_AUTHORITIES]] },
  ];
  return (
    <section id="kyb-sources" aria-labelledby="kyb-sources-h" className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] border-[var(--gb-primary)] bg-[var(--gb-surface)] p-4 sm:p-5 text-[var(--gb-text)]">
      <h2 id="kyb-sources-h" className="text-2xl">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="kyb-sources-body" className="inline-flex min-h-[44px] items-center gap-2 text-left">
          📂 Sources
          <ChevronDown className={`w-6 h-6 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">{open ? '(hide)' : '(show)'}</span>
        </button>
      </h2>
      {open && <div id="kyb-sources-body">
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.title} className="flex flex-col gap-2 rounded-xl border border-[var(--gb-border-strong)] bg-[var(--gb-bg)] p-4">
            <p className="flex flex-wrap items-center gap-2 font-black"><span aria-hidden="true">{c.emoji}</span>{c.title}</p>
            <span className={`self-start rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] ${c.planned ? 'border-[var(--gb-text)]' : 'border-[var(--gb-primary)] text-[var(--gb-primary)]'}`}>{c.status}</span>
            <p className="text-sm leading-relaxed">{c.body}</p>
            {c.links.length > 0 && (
              <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
                {c.links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer noopener" className="text-sm font-bold text-[var(--gb-link)] underline underline-offset-2">{label} ↗</a>)}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed">Nonpartisan and independent: not affiliated with any campaign, party or election authority. Always double-check your <a className="font-bold text-[var(--gb-link)] underline" href={LINKS.myInfo} target="_blank" rel="noreferrer noopener">official sample ballot</a>.</p>
      </div>}
    </section>
  );
}

function PrintBallot({ sections, picks, label, numbered, region }: { sections: { id: SectionId; title: string; ids: string[] }[]; picks: Record<string, Choice>; label?: string; numbered: boolean; region: string }) {
  return (
    <div className="hidden print:block p-6 text-black bg-white text-[11pt]">
      <h1 className="text-xl font-black">My Ballot · {region} · Nov 3, 2026</h1>
      {label && <p>{label}</p>}
      {sections.map((s) => (
        <section key={s.id} className="mt-4 break-inside-avoid-page">
          <h2 className="font-black border-b border-black">{s.title}</h2>
          <table className="w-full table-fixed">
            <tbody>
              {s.ids.map((id) => { const { what, pick } = describePick(id, picks[id], numbered); return (
                <tr key={id} className="align-top"><td className="w-3/5 py-0.5 pr-4">{what}</td><td className="py-0.5 font-bold">{pick}</td></tr>
              ); })}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mt-4">Illinois voters may use sample ballots and notes while voting.</p>
    </div>
  );
}
