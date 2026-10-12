import { ArrowLeft, ChevronDown, Crosshair, MapPin, Printer, Search, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import rawData from './data/ballot.json';
import { ballotFor, ballotIdsFor, districtsAt, geocode, inChicago, inCook, prefetchDistricts } from './lookup';
import { RETENTION_EXPLAINER } from './offices';
import { LINKS, PlanToVote } from './PlanToVote';
import { CandidateSheet, Compare, MeasureCard, RaceCard, RetentionCard } from './Race';
import { JUDGE_RATINGS } from './research';
import { drawShareCard, shareCard } from './share';
import { daysUntil, hasProgress, isDecided, readResumeLink, resumeLink, useSaved, type Choice, type Saved } from './store';
import type { BallotData, Candidate, Districts, Race } from './types';

const data = rawData as unknown as BallotData;
const ballotIds = (d: Districts) => ballotIdsFor(data, d);
const SHARE_URL = `https://frankies2727.github.io${import.meta.env.BASE_URL}projects/know-your-ballot`;
// Runs elections in suburban Cook (the Chicago Board runs Chicago's).
const COOK_CLERK = 'https://www.cookcountyclerkil.gov/';

// Ballot order. Section colours are the lab's six; party never gets a colour.
const SECTIONS = [
  { id: 'federal', title: 'Federal', color: '#009CDF', ink: '#0F1117', emoji: '🏛️' },
  { id: 'state', title: 'Illinois', color: '#973999', ink: '#FFFFFF', emoji: '⭐' },
  { id: 'county', title: 'Cook County', color: '#F78200', ink: '#0F1117', emoji: '🏙️' },
  { id: 'judicial', title: 'Judges', color: '#FFB900', ink: '#0F1117', emoji: '⚖️' },
  { id: 'retention', title: 'Keep these judges?', color: '#FFB900', ink: '#0F1117', emoji: '🧑‍⚖️' },
  { id: 'school', title: 'Chicago school board', color: '#5EBD3E', ink: '#0F1117', emoji: '🍎' },
  { id: 'measures', title: 'Ballot questions', color: '#E23838', ink: '#FFFFFF', emoji: '🗳️' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

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

const DISTRICT_CHIPS: [keyof Districts, string][] = [
  ['ward', 'Ward'], ['cd', 'Congress'], ['sldu', 'State Senate'], ['sldl', 'State House'],
  ['commissioner', 'County Board'], ['subcircuit', 'Subcircuit'], ['school', 'School'],
];

function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% of your ballot decided`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#262B34" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5EBD3E" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#F5F6F7" fontSize={size * 0.26} fontWeight="900">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const colors = ['#5EBD3E', '#FFB900', '#F78200', '#E23838', '#973999', '#009CDF'];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden">
      <style>{'@keyframes kyb-fall{to{transform:translateY(110vh) rotate(720deg)}}'}</style>
      {Array.from({ length: 80 }, (_, i) => (
        <span key={i} className="absolute top-[-20px] w-2.5 h-4 rounded-sm" style={{
          left: `${(i * 37) % 100}%`, background: colors[i % 6],
          animation: `kyb-fall ${2 + (i % 5) * 0.3}s ${(i % 10) * 0.08}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

export function KnowYourBallot({ onExit }: { onExit: () => void }) {
  const [saved, setSaved] = useSaved();
  const browsing = !!saved.browsing;
  const setBrowsing = (on: boolean) => setSaved((s) => ({ ...s, browsing: on || undefined }));
  const [tab, setTab] = useState<'ballot' | 'plan' | 'share'>('ballot');
  // Someone coming back mid-ballot gets a nudge to pick up where they left off.
  const [welcomeBack, setWelcomeBack] = useState(() => hasProgress(saved));
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ retention: true });
  const [toast, setToast] = useState('');
  const [party, setParty] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const districts = saved.place?.districts ?? null;
  // Ballot numbers come from the Chicago Board's list and only match Chicago
  // ballots; suburban ballots number candidates differently.
  const chicago = districts ? inChicago(districts) : true;
  const showBallot = !!saved.place || browsing;
  const daysLeft = daysUntil(data.election.date);

  // ---- the voter's ballot and their progress through it --------------------
  const ballot = useMemo(() => ballotFor(data, districts), [districts]);
  const sections = useMemo(() => SECTIONS.map((s) => {
    const ids = s.id === 'retention' ? ballot.retentions.map((r) => r.id)
      : s.id === 'measures' ? ballot.measures.map((m) => m.id)
      : ballot.races.filter((r) => r.section === s.id).map((r) => r.id);
    return { ...s, ids, done: ids.filter((id) => isDecided(saved.picks[id])).length };
  }).filter((s) => s.ids.length), [ballot, saved.picks]);
  const total = sections.reduce((n, s) => n + s.ids.length, 0);
  const done = sections.reduce((n, s) => n + s.done, 0);
  const allDone = total > 0 && done === total;

  const choose = useCallback((id: string, c: Choice) => setSaved((s) => ({ ...s, picks: { ...s.picks, [id]: c } })), [setSaved]);
  const openSheet = useCallback((race: Race, c: Candidate) => setSheet({ race, c }), []);
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
        setWelcomeBack(true);
      });
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, [setSaved]);

  const nextUp = () => {
    const s = sections.find((sec) => sec.done < sec.ids.length);
    const id = s?.ids.find((i) => !isDecided(saved.picks[i]));
    if (!s || !id) return;
    setTab('ballot');
    setCollapsed((c) => ({ ...c, [s.id]: false }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`race-${id}`);
      el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      el?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    });
  };

  // ---- address -> districts --------------------------------------------------
  const place = async (lat: number, lng: number, label: string) => {
    const d = await districtsAt(lat, lng);
    if (!inCook(d)) { setStatus({ busy: false, error: '', outside: true }); return; }
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
        ? DISTRICT_CHIPS.filter(([k]) => old[k] !== d[k]).map(([k, label]) => ({ label, from: old[k], to: d[k] }))
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
    window.scrollTo({ top: 0 });
  };
  const lookUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!address.trim() || status.busy) return;
    setStatus({ busy: true, error: '', outside: false });
    try {
      const hit = await geocode(address.trim());
      if (!hit) { setStatus({ busy: false, error: 'We couldn’t find that address in Cook County. Try the street number, name and town, like “1501 Sherman Ave, Evanston”.', outside: false }); return; }
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
    const url = await resumeLink(saved, `${location.origin}${import.meta.env.BASE_URL}projects/know-your-ballot`);
    try {
      if (send && navigator.share) { await navigator.share({ title: 'My ballot progress', url }); return; }
      await navigator.clipboard.writeText(url);
      setLinkMsg('Link copied. Paste it somewhere safe, like a note or a text to yourself.');
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
    setWelcomeBack(false);
    window.scrollTo({ top: 0 });
  };

  const doShare = async () => {
    setShareMsg('');
    try {
      const blob = await drawShareCard({
        done, total, daysLeft, url: SHARE_URL, place: chicago ? 'Chicago' : 'Cook County',
        sections: sections.map((s) => ({ title: s.title, color: s.color, done: s.done, total: s.ids.length })),
      });
      setShareMsg((await shareCard(blob, SHARE_URL)) === 'downloaded' ? 'Saved the image: post it anywhere.' : 'Thanks for spreading the word!');
    } catch {
      setShareMsg('Couldn’t make the image on this device.');
    }
  };

  const raceById = useMemo(() => new Map(data.races.map((r) => [r.id, r])), []);
  const sectionOf = (id: string) => SECTIONS.find((s) => s.id === id)!;
  const picksFor = (id: string) => { const c = saved.picks[id]; return Array.isArray(c) ? c : []; };

  // ---- screens ------------------------------------------------------------------
  return (
    <div className="min-h-[100dvh] bg-[#0F1117] text-[#F5F6F7] font-sans selection:bg-[#009CDF] selection:text-[#0F1117]">
      <div className="h-1.5 flex print:hidden" aria-hidden="true">
        {['#5EBD3E', '#FFB900', '#F78200', '#E23838', '#973999', '#009CDF'].map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24 print:hidden">
        <nav className="flex items-center justify-between py-4">
          <button type="button" onClick={onExit} className="inline-flex items-center gap-2 min-h-[44px] font-bold text-[#F5F6F7] hover:text-[#FFB900]">
            <ArrowLeft className="w-5 h-5" /> Frankie Labs
          </button>
          <span className="rounded-full bg-[#262B34] px-3 py-1 text-sm font-bold">
            {daysLeft > 0 ? `${daysLeft} days to Nov 3` : daysLeft === 0 ? 'Election Day!' : 'Nov 3, 2026'}
          </span>
        </nav>

        {!showBallot ? (
          <Landing
            address={address} setAddress={setAddress} status={status} onSubmit={lookUp} onLocate={useLocation}
            onBrowse={() => setBrowsing(true)} daysLeft={daysLeft}
            saved={Object.keys(saved.picks).length}
            onStartFresh={() => { setSaved((s) => ({ ...s, picks: {}, plan: {} })); setToast('Cleared. Starting fresh.'); }}
          />
        ) : (
          <>
            {/* Sticky progress bar: the thing that keeps you going. */}
            <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-[#0F1117]/95 backdrop-blur border-b-2 border-[#262B34]">
              <div className="flex items-center gap-4">
                <Ring pct={total ? done / total : 0} />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-lg leading-tight">{allDone ? 'Ballot ready 🎉' : `${done} of ${total} decided`}</p>
                  <button type="button" onClick={changeAddress} className="flex max-w-full items-center gap-1.5 text-sm text-[#E2E4E8] hover:text-[#F5F6F7]">
                    <span className="truncate">{saved.place ? `📍 ${saved.place.label}` : 'Browsing every race'}</span>
                    <span className="shrink-0 font-bold text-[#F5F6F7] underline underline-offset-2">{saved.place ? 'Change' : 'Add address'}</span>
                  </button>
                </div>
                {!allDone && (
                  <button type="button" onClick={nextUp} className="shrink-0 min-h-[44px] rounded-xl bg-[#5EBD3E] px-4 font-black text-[#0F1117]">Next up →</button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2" role="tablist" aria-label="Views">
                {([['ballot', 'My Ballot'], ['plan', 'Plan to vote'], ['share', 'Save & share']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}
                    className={`min-h-[44px] rounded-xl font-bold border-2 ${tab === id ? 'bg-[#F5F6F7] text-[#0F1117] border-[#F5F6F7]' : 'border-[#2E343F] text-[#F5F6F7] hover:border-[#F5F6F7]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'ballot' && (
              <div className="space-y-8 pt-6">
                {incoming && (
                  <div role="alertdialog" aria-label="Load saved progress?" className="rounded-2xl border-2 border-[#009CDF] bg-[#1A1D24] p-4 space-y-3">
                    <p className="font-black">Load progress from your saved link?</p>
                    <p className="text-[15px] text-[#E2E4E8]">It has {Object.keys(incoming.picks).length} decisions. This device has {Object.keys(saved.picks).length}. Loading replaces what’s here.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setSaved(incoming); setIncoming(null); setWelcomeBack(true); }} className="min-h-[44px] rounded-xl bg-[#009CDF] px-4 font-black text-[#0F1117]">Load my saved link</button>
                      <button type="button" onClick={() => setIncoming(null)} className="min-h-[44px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold">Keep this device’s</button>
                    </div>
                  </div>
                )}
                {change && <ChangeReport change={change} onDismiss={() => setChange(null)} onNext={() => { setChange(null); nextUp(); }} />}
                {welcomeBack && !change && !allDone && done > 0 && (
                  <div className="rounded-2xl bg-[#5EBD3E] p-4 text-[#0F1117] space-y-3">
                    <p className="text-lg font-black leading-snug">Welcome back! You’re {done} of {total} done.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setWelcomeBack(false); nextUp(); }} className="min-h-[44px] rounded-xl bg-[#0F1117] px-4 font-black text-[#F5F6F7]">Pick up where I left off →</button>
                      <button type="button" onClick={() => setWelcomeBack(false)} className="min-h-[44px] rounded-xl border-2 border-[#0F1117] px-4 font-bold">Dismiss</button>
                    </div>
                  </div>
                )}
                <WhereYouVote districts={districts} chicago={chicago} onChange={changeAddress} />

                {sections.map((s) => {
                  const open = !collapsed[s.id];
                  return (
                    <section key={s.id} aria-labelledby={`sec-${s.id}`} className="space-y-4">
                      <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [s.id]: open }))} aria-expanded={open}
                        className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left" style={{ background: s.color, color: s.ink }}>
                        <span className="text-2xl" aria-hidden="true">{s.emoji}</span>
                        <span id={`sec-${s.id}`} className="flex-1 text-xl font-black">{s.title}</span>
                        <span className="rounded-full bg-[#0F1117] px-3 py-1 text-sm font-black text-[#F5F6F7]">{s.done}/{s.ids.length}</span>
                        <ChevronDown className={`w-6 h-6 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>

                      {open && s.id === 'retention' && (
                        <div className="space-y-3">
                          <p className="text-[15px] leading-relaxed text-[#E2E4E8]">{RETENTION_EXPLAINER} Chicago-area bar associations rate every judge: <a className="font-bold text-[#FFB900] underline underline-offset-2" href={JUDGE_RATINGS} target="_blank" rel="noreferrer noopener">see the ratings ↗</a></p>
                          <button type="button" onClick={() => setSaved((sv) => ({ ...sv, picks: { ...sv.picks, ...Object.fromEntries(s.ids.filter((id) => !isDecided(sv.picks[id])).map((id) => [id, 'skip' as Choice])) } }))}
                            className="min-h-[44px] rounded-xl border-2 border-[#2E343F] px-4 font-bold text-[#F5F6F7] hover:border-[#F5F6F7]">
                            Skip the ones I haven’t answered
                          </button>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {ballot.retentions.map((r) => <RetentionCard key={r.id} r={r} choice={saved.picks[r.id]} onChoose={choose} />)}
                          </div>
                        </div>
                      )}
                      {open && s.id === 'measures' && ballot.measures.map((m) => <MeasureCard key={m.id} m={m} choice={saved.picks[m.id]} onChoose={choose} />)}
                      {open && s.id !== 'retention' && s.id !== 'measures' && s.ids.map((id) => {
                        const race = raceById.get(id)!;
                        return (
                          <RaceCard key={id} race={race} color={s.color} ink={s.ink} numbered={chicago && race.numbered !== false} choice={saved.picks[id]}
                            onChoose={choose} onInfo={openSheet} onCompare={setComparing} />
                        );
                      })}
                    </section>
                  );
                })}

                <Sources />
              </div>
            )}

            {tab === 'plan' && (
              <div className="pt-6 space-y-6">
                <PlanToVote plan={saved.plan} setPlan={setPlan} chicago={chicago} clerk={COOK_CLERK} ward={districts?.ward}
                  wardSite={districts?.ward ? data.earlyVotingSites[districts.ward] : undefined}
                  ballotDone={allDone} />
                <button type="button" onClick={() => window.print()} className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-[#F5F6F7] font-black text-[#F5F6F7] hover:bg-[#262B34]">
                  <Printer className="w-5 h-5" aria-hidden="true" /> Print My Ballot
                </button>
              </div>
            )}

            {tab === 'share' && (
              <div className="pt-6 space-y-5">
                <section className="rounded-2xl border-2 border-[#009CDF] bg-[#1A1D24] p-5 space-y-3" aria-labelledby="kyb-keep">
                  <h2 id="kyb-keep" className="text-2xl font-black leading-tight">💾 Keep your progress</h2>
                  <p className="text-[15px] leading-relaxed text-[#E2E4E8]">Your picks save on this device automatically. To pick up on another phone or computer, or in case your browser clears its data, save a link: opening it brings everything back.</p>
                  <div className="flex flex-wrap gap-2">
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button type="button" onClick={() => saveLink(true)} className="min-h-[48px] rounded-xl bg-[#009CDF] px-4 font-black text-[#0F1117]">Send it to myself</button>
                    )}
                    <button type="button" onClick={() => saveLink(false)} className="min-h-[48px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold">Copy my link</button>
                  </div>
                  {linkMsg && <p role="status" className="font-bold">{linkMsg}</p>}
                  <p className="text-sm text-[#E2E4E8]">🔒 The link holds your picks and districts, not your street address. Keep it to yourself.</p>
                </section>
                <h2 className="text-2xl font-black leading-tight">Get your people to look up theirs</h2>
                <p className="text-[15px] leading-relaxed text-[#E2E4E8]">Share a card with your progress: how many races you’ve researched, section by section. <strong className="text-[#F5F6F7]">It never shows who you picked.</strong></p>
                <div className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] p-5 space-y-3">
                  {sections.map((s) => (
                    <div key={s.id}>
                      <div className="flex justify-between font-bold"><span>{s.title}</span><span>{s.done}/{s.ids.length}</span></div>
                      <div className="h-3 rounded-full bg-[#262B34] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.done / s.ids.length) * 100}%`, background: s.color }} /></div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={doShare} className="w-full inline-flex items-center justify-center gap-2 min-h-[56px] rounded-xl bg-[#FFB900] font-black text-lg text-[#0F1117]">
                  <Share2 className="w-5 h-5" aria-hidden="true" /> Share my progress
                </button>
                {shareMsg && <p role="status" className="font-bold text-center">{shareMsg}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Print view: the voter's picks, in ballot order, to take into the booth. */}
      <PrintBallot sections={sections} picks={saved.picks} label={saved.place?.label} numbered={chicago} />

      {sheet && (
        <CandidateSheet race={sheet.race} c={sheet.c} color={sectionOf(sheet.race.section).color} ink={sectionOf(sheet.race.section).ink} numbered={chicago && sheet.race.numbered !== false}
          picked={picksFor(sheet.race.id).includes(sheet.c.ballot)}
          onPick={() => {
            const cur = picksFor(sheet.race.id);
            const has = cur.includes(sheet.c.ballot);
            const next = has ? cur.filter((b) => b !== sheet.c.ballot) : sheet.race.voteFor === 1 ? [sheet.c.ballot] : [...cur, sheet.c.ballot].slice(-sheet.race.voteFor);
            choose(sheet.race.id, next);
          }}
          onClose={() => setSheet(null)} />
      )}
      {comparing && (
        <Compare race={comparing} color={sectionOf(comparing.section).color} ink={sectionOf(comparing.section).ink} numbered={chicago && comparing.numbered !== false} picked={picksFor(comparing.id)}
          onPick={(b) => {
            const cur = picksFor(comparing.id);
            choose(comparing.id, cur.includes(b) ? cur.filter((x) => x !== b) : comparing.voteFor === 1 ? [b] : [...cur, b].slice(-comparing.voteFor));
          }}
          onClose={() => setComparing(null)} />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 inset-x-4 z-[55] mx-auto max-w-md rounded-2xl bg-[#F5F6F7] px-5 py-4 text-center font-black text-[#0F1117] shadow-2xl print:hidden">{toast}</div>
      )}
      {party && <Confetti onDone={() => setParty(false)} />}
    </div>
  );
}

// ---- pieces ------------------------------------------------------------------------

function Landing({ address, setAddress, status, onSubmit, onLocate, onBrowse, daysLeft, saved, onStartFresh }: {
  address: string; setAddress: (s: string) => void; status: { busy: boolean; error: string; outside: boolean };
  onSubmit: (e: FormEvent) => void; onLocate: () => void; onBrowse: () => void; daysLeft: number;
  /** Picks already saved on this device. */
  saved: number; onStartFresh: () => void;
}) {
  // Two taps: wiping someone's picks shouldn't be one slip of the thumb.
  const [confirming, setConfirming] = useState(false);
  const candidates = data.races.reduce((n, r) => n + r.candidates.length, 0);
  // Start fetching the district maps while the voter types, so "Find my
  // ballot" doesn't wait on a download.
  useEffect(() => { prefetchDistricts(); }, []);
  return (
    <div className="space-y-8 pt-6">
      <header className="space-y-4">
        {daysLeft > 0 && (
          <p className="inline-flex items-baseline gap-2 rounded-2xl bg-[#FFB900] px-4 py-2 text-[#0F1117]">
            <span className="text-4xl font-black leading-none">{daysLeft}</span>
            <span className="font-black">days until Election Day</span>
          </p>
        )}
        <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] tracking-tight">Every name on your ballot, explained.</h1>
        <p className="text-lg leading-relaxed text-[#E2E4E8]">For Chicago and suburban Cook County. The Nov 3 ballot runs from U.S. Senate down to judges (and, in Chicago, your school board). Enter your address to see exactly what’s on yours, what each job does, who’s running and who’s funding them. Then make your picks and bring them to the booth.</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="kyb-address" className="block font-black text-lg">Your address in Cook County</label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#F5F6F7] pointer-events-none" aria-hidden="true" />
            <input id="kyb-address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 121 N LaSalle St or 1501 Sherman Ave, Evanston"
              className="w-full min-h-[56px] rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] pl-12 pr-4 text-lg font-bold text-[#F5F6F7] focus:border-[#009CDF] focus:outline-none" />
          </div>
          <button type="submit" disabled={status.busy} className="shrink-0 min-h-[56px] rounded-2xl bg-[#009CDF] px-5 font-black text-[#0F1117] disabled:cursor-wait inline-flex items-center gap-2">
            <Search className="w-5 h-5" aria-hidden="true" /><span className="hidden sm:inline">{status.busy ? 'Finding…' : 'Find my ballot'}</span><span className="sm:hidden">{status.busy ? '…' : 'Go'}</span>
          </button>
        </div>
        <button type="button" onClick={onLocate} disabled={status.busy} className="inline-flex items-center gap-2 min-h-[44px] font-bold text-[#F5F6F7] underline underline-offset-4 disabled:cursor-wait">
          <Crosshair className="w-5 h-5" aria-hidden="true" /> Use my current location
        </button>
        {status.error && <p role="alert" className="rounded-xl bg-[#E23838] px-4 py-3 font-bold text-white">{status.error}</p>}
        {status.outside && (
          <p role="alert" className="rounded-xl bg-[#262B34] border-2 border-[#FFB900] px-4 py-3 font-bold">
            That address is outside Cook County. This guide covers Chicago and suburban Cook for now. Anywhere else in Illinois, look up your registration and polling place with the <a className="underline text-[#FFB900]" href={LINKS.stateLookup} target="_blank" rel="noreferrer noopener">State Board of Elections ↗</a>.
          </p>
        )}
        {saved > 0 && (
          <div className="rounded-xl border-2 border-[#2E343F] bg-[#1A1D24] p-3 space-y-2">
            <p className="text-[15px]">You have <strong>{saved} pick{saved === 1 ? '' : 's'}</strong> saved. Same voter, new address? Races on both ballots keep their picks. Looking up someone else’s ballot? Start fresh.</p>
            <button type="button" onClick={() => { if (confirming) { onStartFresh(); setConfirming(false); } else setConfirming(true); }}
              className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${confirming ? 'border-[#E23838] bg-[#E23838] text-white' : 'border-[#F5F6F7] text-[#F5F6F7]'}`}>
              {confirming ? `Tap again to clear ${saved} pick${saved === 1 ? '' : 's'} and your plan` : 'Start fresh'}
            </button>
          </div>
        )}
        <p className="text-sm leading-relaxed text-[#E2E4E8]">🔒 Your address goes once to Cook County’s address lookup (or OpenStreetMap, if the county’s is down) to find your districts. It’s saved only on this device, like your picks, and never shared.</p>
      </form>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [data.races.length, 'races across Cook'], [candidates, 'candidates'],
          [data.retentions.length, 'judges up for retention'], [data.measures.length, 'ballot questions'],
        ].map(([n, label]) => (
          <li key={label} className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] p-4">
            <span className="block text-3xl font-black">{n}</span>
            <span className="block text-sm font-bold text-[#E2E4E8]">{label}</span>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onBrowse} className="min-h-[44px] font-bold text-[#F5F6F7] underline underline-offset-4">
        Or browse every race in Cook County →
      </button>
      <Sources />
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
    <li key={x.what} className="flex flex-wrap justify-between gap-x-3"><span>{x.what}</span><strong className="text-[#F5F6F7]">{x.pick}</strong></li>
  );
  return (
    <section aria-labelledby="kyb-change" className="rounded-2xl border-2 border-[#009CDF] bg-[#1A1D24] p-4 space-y-4 text-[15px] leading-relaxed text-[#E2E4E8]">
      <h2 id="kyb-change" className="text-lg font-black text-[#F5F6F7]">📍 Your ballot changed with your address</h2>
      {change.districts.length > 0 && (
        <div>
          <p className="font-black text-[#F5F6F7]">Your districts</p>
          <ul className="space-y-0.5">
            {change.districts.map((x) => (
              <li key={x.label}>{x.label}: {x.from ?? 'none'} → <strong className="text-[#F5F6F7]">{x.to ?? (x.label === 'Ward' ? 'none (outside Chicago)' : 'none')}</strong></li>
            ))}
          </ul>
        </div>
      )}
      {change.kept.length > 0 && (
        <div>
          <p className="font-black text-[#5EBD3E]">✓ Kept {change.kept.length} pick{change.kept.length === 1 ? '' : 's'}: same race on both ballots</p>
          <ul className="space-y-0.5">{change.kept.map(row)}</ul>
        </div>
      )}
      {change.cleared.length > 0 && (
        <div>
          <p className="font-black text-[#FF6B6B]">✕ Cleared {change.cleared.length} pick{change.cleared.length === 1 ? '' : 's'}: not on your new ballot</p>
          <ul className="space-y-0.5">{change.cleared.map(row)}</ul>
        </div>
      )}
      {change.added.length > 0 && (
        <div>
          <p className="font-black text-[#FFB900]">＋ New on this ballot: {change.added.length} race{change.added.length === 1 ? '' : 's'} to decide</p>
          <ul className="space-y-0.5">
            {change.added.slice(0, 6).map((what) => <li key={what}>{what}</li>)}
            {change.added.length > 6 && <li>and {change.added.length - 6} more</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onNext} className="min-h-[44px] rounded-xl bg-[#009CDF] px-4 font-black text-[#0F1117]">Go to what’s left →</button>
        <button type="button" onClick={onDismiss} className="min-h-[44px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold text-[#F5F6F7]">Got it</button>
      </div>
    </section>
  );
}

function WhereYouVote({ districts, chicago, onChange }: { districts: Districts | null; chicago: boolean; onChange: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] p-4 space-y-3">
      {districts ? (
        <>
          <p className="font-black">Your districts</p>
          <ul className="flex flex-wrap gap-2">
            {DISTRICT_CHIPS.filter(([k]) => districts[k]).map(([k, label]) => (
              <li key={k} className="rounded-full bg-[#262B34] px-3 py-1 text-sm font-bold">{label} {districts[k]}</li>
            ))}
          </ul>
          {!chicago && (
            <div className="rounded-xl border-2 border-[#FFB900] bg-[#262B34] p-3 text-[15px] leading-relaxed">
              <p className="font-black text-[#FFB900]">Suburban Cook: a few things aren’t in here yet</p>
              <p>Not included: {suburbanGaps(districts).join(' and ')}. Ballot numbers aren’t shown because suburban ballots order candidates differently. See your full sample ballot at the <a className="font-bold underline text-[#F5F6F7]" href={COOK_CLERK} target="_blank" rel="noreferrer noopener">Cook County Clerk ↗</a>.</p>
            </div>
          )}
          <p className="text-sm text-[#E2E4E8]">
            Not right? Check the <a className="font-bold underline text-[#F5F6F7]" href={chicago ? LINKS.addressLookup : LINKS.stateLookup} target="_blank" rel="noreferrer noopener">official address lookup ↗</a> or{' '}
            <button type="button" onClick={onChange} className="font-bold underline text-[#F5F6F7]">change your address</button>.
          </p>
        </>
      ) : (
        <p className="text-[15px]">You’re seeing <strong>every</strong> race on any ballot in Chicago or suburban Cook. <button type="button" onClick={onChange} className="font-bold underline">Enter your address</button> to see only yours.</p>
      )}
    </div>
  );
}

function Sources() {
  const s = data.sources;
  return (
    <footer className="rounded-2xl border-2 border-[#2E343F] p-5 space-y-2 text-sm leading-relaxed text-[#E2E4E8]">
      <p className="font-black text-[#F5F6F7]">Where this comes from</p>
      <p>Candidates and ballot questions: <a className="underline font-bold text-[#F5F6F7]" href={s.candidates.url} target="_blank" rel="noreferrer noopener">Chicago Board of Elections candidate list</a>{s.candidates.asOf ? `, as of ${s.candidates.asOf}` : ''}, in official ballot order; suburban contests from the <a className="underline font-bold text-[#F5F6F7]" href={s.stateCandidates.url} target="_blank" rel="noreferrer noopener">State Board of Elections certified list</a>. Campaign money and incumbency: <a className="underline font-bold text-[#F5F6F7]" href={s.money.url} target="_blank" rel="noreferrer noopener">Federal Election Commission</a> and <a className="underline font-bold text-[#F5F6F7]" href={s.stateMoney.url} target="_blank" rel="noreferrer noopener">Illinois State Board of Elections</a>. District maps: U.S. Census Bureau, Cook County, City of Chicago and the Illinois Senate.</p>
      <p>Nonpartisan and independent: not affiliated with any campaign, party or election authority. Always double-check your <a className="underline font-bold text-[#F5F6F7]" href={LINKS.myInfo} target="_blank" rel="noreferrer noopener">official sample ballot</a>.</p>
    </footer>
  );
}

function PrintBallot({ sections, picks, label, numbered }: { sections: { id: SectionId; title: string; ids: string[] }[]; picks: Record<string, Choice>; label?: string; numbered: boolean }) {
  return (
    <div className="hidden print:block p-6 text-black bg-white text-[11pt]">
      <h1 className="text-xl font-black">My Ballot · {numbered ? 'Chicago' : 'Cook County'} · Nov 3, 2026</h1>
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
