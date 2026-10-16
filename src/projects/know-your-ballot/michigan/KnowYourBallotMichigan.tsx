import { ChevronDown, Crosshair, ListChecks, Loader2, MapPin, Printer, Search, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ClearButton } from '../../../components/ClearButton';
import { BrowsingNotice, Confetti, ContinueCard, HowBallotWorks, Locating, Ring, useWide, SectionCards, SectionFlip, useBallotView, useDocumentMeta, type SectionCard } from '../Bits';
import { Group } from '../Calendar';
import { billItems, billUrl, changeItems, dateItems, Feed, newsItems } from '../Feed';
import { Laws } from '../Laws';
import { NextElectionNote } from './NextUp';
import { Headliners } from '../Headliners';
import { ContentsColumn, ContentsDrawer } from '../Contents';
import { earnedTrophies, streak, Trophies } from '../Progress';
import { CandidateSheet, Compare, MeasureCard, RaceCard } from '../Race';
import { BallotSearch, type Hit } from '../Search';
import { drawShareCard, shareCard } from '../share';
import { ReadOnlyContext, StateContext } from '../state';
import { GovbotChrome } from '../GovbotChrome';
import { daysUntil, hasProgress, isDecided, readResumeLink, resumeLink, today, useNow, useOpen, useSaved, type Choice, type Saved } from '../store';
import type { Candidate, Districts, Race } from '../types';
import '../ballot.css';
import './michigan.css';
import { DISTRICT_CHIPS, LINKS, MICHIGAN, SECTION_TITLES, SECTIONS, SHARE_URL, STORAGE_KEY, type SectionId } from './config';
import rawData from '../data/michigan/ballot.json';
import { KEY_DATES } from './dates';
import { MichiganMap } from './Hero';
import { ballotFor, ballotIdsFor, districtsAt, geocode, inMichigan, prefetchDistricts } from './lookup';
import { PlanToVote } from './PlanToVote';
import type { MichiganData } from './types';

const data = rawData as unknown as MichiganData;
const everything = ballotFor(data, null);
const raceById = new Map(data.races.map((r) => [r.id, r]));
const sectionOf = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];

/** A section colour as a real colour (the share card is drawn on a canvas, which can't read CSS variables). */
const cssColor = (v: string) => {
  const m = v.match(/^var\((--[\w-]+)\)$/);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#3DDC84' : v;
};

/** A pick in words: what the contest is and what the voter chose. */
function describePick(id: string, c: Choice | undefined): { what: string; pick: string } {
  const race = raceById.get(id);
  if (race) {
    const chosen = Array.isArray(c) ? race.candidates.filter((x) => c.includes(x.ballot)).map((x) => x.name).join(', ') : '';
    return { what: race.office, pick: chosen || (c === 'skip' ? 'Skip' : '—') };
  }
  const m = data.measures.find((x) => x.id === id);
  return { what: m?.title ?? id, pick: c === 'yes' ? 'Yes' : c === 'no' ? 'No' : c === 'skip' ? 'Skip' : '—' };
}

export function KnowYourBallotMichigan() {
  useDocumentMeta('Know Your Ballot: Michigan', '🧤');
  const [saved, setSaved] = useSaved(STORAGE_KEY);
  const browsing = !!saved.browsing;
  const setBrowsing = (on: boolean) => setSaved((s) => ({ ...s, browsing: on || undefined }));
  const [tab, setTab] = useState<'ballot' | 'plan' | 'share' | 'how' | 'feed'>('ballot');
  const [incoming, setIncoming] = useState<Saved | null>(null);
  const [linkMsg, setLinkMsg] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<{ busy: boolean; error: string; outside: boolean }>({ busy: false, error: '', outside: false });
  // Where the voter is, for the pin on the map (this session only; the
  // saved place keeps districts, never coordinates).
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [sheet, setSheet] = useState<{ race: Race; c: Candidate } | null>(null);
  const [comparing, setComparing] = useState<Race | null>(null);
  const [chosenSection, setChosenSection] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const closeContents = useCallback(() => setContentsOpen(false), []);
  // The pinned bar's height, as --kyb-bar, for what has to sit below it.
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((bar: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    const root = document.documentElement;
    if (!bar) { root.style.removeProperty('--kyb-bar'); return; }
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
  useEffect(() => {
    const d = today();
    setSaved((s) => ({ ...s, days: s.days?.includes(d) ? s.days : [...(s.days ?? []), d].slice(-30) }));
  }, [setSaved]);

  const districts = saved.place?.districts ?? null;
  // The details view has its own URL; with saved progress the first open goes straight there.
  const [showBallot, showView] = useBallotView('know-your-ballot-michigan', !!saved.place || browsing);
  const browse = () => { setBrowsing(true); showView(true); };
  const daysLeft = daysUntil(data.election.date);

  // ---- the voter's ballot and their progress through it --------------------
  const ballot = useMemo(() => ballotFor(data, districts), [districts]);
  const sections = useMemo(() => SECTIONS.map((s) => {
    const ids = s.id === 'measures' ? ballot.measures.map((m) => m.id) : ballot.races.filter((r) => r.section === s.id).map((r) => r.id);
    return { ...s, ids, done: ids.filter((id) => isDecided(saved.picks[id])).length };
  }).filter((s) => s.ids.length), [ballot, saved.picks]);
  const sectionFor = (id: string) => raceById.get(id)?.section ?? 'measures';
  const total = sections.reduce((n, s) => n + s.ids.length, 0);
  const done = sections.reduce((n, s) => n + s.done, 0);
  const allDone = total > 0 && done === total;

  const choose = useCallback((id: string, c: Choice) => setSaved((s) => {
    const d = today();
    const goal = !isDecided(s.picks[id]) && isDecided(c) ? { day: d, n: (s.goal?.day === d ? s.goal.n : 0) + 1 } : s.goal;
    return { ...s, picks: { ...s.picks, [id]: c }, goal, best: Math.max(s.best ?? 0, goal?.day === d ? goal.n : 0) || undefined };
  }), [setSaved]);
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
    const sameBallot = prevDistricts.current === districts;
    prevDistricts.current = districts;
    if (!before || !saved.place || !sameBallot) return;
    if (allDone && !Object.values(before).every(Boolean)) { setParty(true); setToast('🎉 Your whole ballot is ready! Print it or share your progress.'); return; }
    const finished = sections.find((s) => now[s.id] && !before[s.id]);
    if (finished) {
      const left = sections.filter((s) => !now[s.id]).length;
      setToast(`✅ ${finished.title}: done! ${left} section${left === 1 ? '' : 's'} to go.`);
    }
  }, [sections, allDone, saved.place, districts]);

  // The progress game: today's goal, streak and trophies.
  const day = today();
  const gameCtx = {
    done, total, allDone, looked: saved.looked ?? 0, plan: saved.plan,
    visits: saved.days?.length ?? 0, streak: streak(saved.days, day), best: saved.best ?? 0,
    hasPlace: !!saved.place, levels: sections,
  };
  const earned = earnedTrophies(gameCtx);
  const earnedIds = earned.map((t) => t.id).join();
  const prevEarned = useRef<{ ids: string; districts: Districts | null } | null>(null);
  useEffect(() => {
    const before = prevEarned.current;
    prevEarned.current = { ids: earnedIds, districts };
    if (!before || before.districts !== districts || !saved.place) return;
    const fresh = earned.find((t) => t.id !== 'ready' && !t.id.startsWith('level-') && !before.ids.split(',').includes(t.id));
    if (fresh) setToast(`${fresh.emoji} Trophy unlocked: ${fresh.name}!`);
  }, [earnedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  // A #resume link (opened, or pasted into this tab): load it, asking first
  // if this device already has progress, then drop it from the address bar.
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

  const scrollTo = (el: Element | null) =>
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const openSection = (sectionId: string) => {
    setTab('ballot');
    setChosenSection(sectionId);
    requestAnimationFrame(() => scrollTo(document.getElementById(`sec-${sectionId}`)?.closest('section') ?? null));
  };
  const jumpTo = (sectionId: string, id: string) => {
    setTab('ballot');
    setChosenSection(sectionId);
    // Two frames: the section has to render, and the pinned bar has to settle.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`race-${id}`);
      const box = el?.closest<HTMLElement>('.kyb-scroll');
      if (el && box) { box.scrollTop = el.offsetTop - 8; scrollTo(box); } else scrollTo(el);
      el?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    }));
  };
  // Links to a race: #race=<id>. Then tidy the address bar.
  const raceLink = useRef<() => void>(() => {});
  raceLink.current = () => {
    const m = location.hash.match(/^#race=([^&]+)/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    const race = raceById.get(decodeURIComponent(m[1]));
    if (!race) return;
    if (districts && !ballotIdsFor(data, districts).has(race.id)) { setToast(`${race.office} isn’t on the ballot at your address. Use the search to see it.`); return; }
    if (!showBallot) browse();
    jumpTo(race.section, race.id);
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
    const d = await districtsAt(lat, lng, data.coa);
    if (!inMichigan(d)) { setStatus({ busy: false, error: '', outside: true }); return; }
    // A new address means a new ballot: statewide picks still stand, picks
    // for races that aren't on this ballot are dropped rather than lingering.
    const onBallot = ballotIdsFor(data, d);
    const decided = (Object.entries(saved.picks) as [string, Choice][]).filter(([, c]) => isDecided(c));
    const cleared = decided.filter(([id]) => !onBallot.has(id)).length;
    setSaved((s) => ({ ...s, place: { label, districts: d }, picks: Object.fromEntries(Object.entries(s.picks).filter(([id]) => onBallot.has(id))) }));
    setPin({ lat, lng });
    if (decided.length) setToast(cleared ? `Kept ${decided.length - cleared} pick${decided.length - cleared === 1 ? '' : 's'}; cleared ${cleared} not on this ballot.` : `Your ${decided.length} pick${decided.length === 1 ? '' : 's'} carried over.`);
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
      if (!hit) { setStatus({ busy: false, error: 'We couldn’t find that address in Michigan. Try the street number, name and city, like “2 Woodward Ave, Detroit”.', outside: false }); return; }
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
  const changeAddress = () => {
    setSaved((s) => ({ ...s, place: null, browsing: undefined }));
    setPin(null);
    setTab('ballot');
    showView(false);
    window.scrollTo({ top: 0 });
  };

  const saveLink = async (send: boolean) => {
    setLinkMsg('');
    const url = await resumeLink(saved, `${location.origin}${import.meta.env.BASE_URL}projects/know-your-ballot-michigan`);
    try {
      if (send && navigator.share) { await navigator.share({ title: 'My ballot progress', url }); setPlan('shared', true); return; }
      await navigator.clipboard.writeText(url);
      setLinkMsg('Link copied. Paste it somewhere safe, like a note or a text to yourself.');
      setPlan('shared', true);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLinkMsg('Couldn’t copy automatically on this device. Try “Send it to myself”.');
    }
  };
  const doShare = async () => {
    setShareMsg('');
    try {
      const blob = await drawShareCard({
        done, total, daysLeft, url: SHARE_URL, place: 'Michigan',
        sections: sections.map((s) => ({ title: s.title, color: cssColor(s.color), done: s.done, total: s.ids.length })),
      });
      setPlan('shared', true);
      setShareMsg((await shareCard(blob, SHARE_URL)) === 'downloaded' ? 'Saved the image: post it anywhere.' : 'Thanks for spreading the word!');
    } catch {
      setShareMsg('Couldn’t make the image on this device.');
    }
  };

  const current = sections.find((s) => s.id === chosenSection)?.id ?? (sections.find((s) => s.done < s.ids.length) ?? sections[0])?.id ?? null;
  const contents = {
    sections, current,
    isDone: (id: string) => isDecided(saved.picks[id]),
    labelOf: (id: string) => describePick(id, undefined).what,
    onSection: openSection,
    onRace: jumpTo,
  };
  const picksFor = (id: string) => { const c = saved.picks[id]; return Array.isArray(c) ? c : []; };
  const togglePick = (race: Race, b: number) => {
    const cur = picksFor(race.id);
    choose(race.id, cur.includes(b) ? cur.filter((x) => x !== b) : race.voteFor === 1 ? [b] : [...cur, b].slice(-race.voteFor));
  };

  // ---- screens ------------------------------------------------------------------
  // The three views. On phones, while the browsing notice is up, they scroll
  // away with the page instead of sitting in the sticky bar.
  const views = ([['ballot', 'My Ballot'], ['plan', 'Plan to vote'], ['share', 'Save & share'], ['how', 'How it works'], ['feed', 'What’s new']] as const).map(([id, label]) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}
      className={`min-h-[44px] rounded-xl font-bold border-2 border-[var(--gb-text)] ${tab === id ? 'bg-[var(--gb-text)] text-[var(--gb-bg)]' : 'text-[var(--gb-text)]'}`}>
      {label}
    </button>
  ));

  const wide = useWide();
  // The view tabs, search and browsing notice: in the sticky bar on wide screens, scrolling under it on phones so the ballot gets the screen.
  const tools = (
    <>
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">{views}</div>
      <div className="mt-3">
        <BallotSearch ballot={ballot} everywhere={districts ? everything : undefined} sections={SECTION_TITLES} onJump={(h) => jumpTo(h.section, h.id)} />
      </div>
      {!saved.place && <BrowsingNotice region="Michigan" onAddAddress={changeAddress} />}
    </>
  );

  return (
    <StateContext.Provider value={MICHIGAN}>
    <ReadOnlyContext.Provider value={!saved.place}>
    <GovbotChrome>
    <div className="kyb kyb-mi min-h-[100dvh] bg-[var(--gb-bg)] text-[var(--gb-text)] selection:bg-[var(--mi-arboretum)] selection:text-[var(--gb-bg)]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-24 print:hidden">
        {!showBallot ? (
          <Landing
            address={address} setAddress={setAddress} status={status} onSubmit={lookUp} onLocate={useLocation} daysLeft={daysLeft}
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
            <div ref={barRef} className="sticky top-[var(--kyb-top)] z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 bg-[var(--gb-bg)] border-b border-[var(--gb-border)]">
              <div className="max-w-[1100px] mx-auto">
                <div className="flex items-center gap-2 sm:gap-4">
                  <button type="button" onClick={() => setContentsOpen(true)} aria-label="Contents"
                    className="lg:hidden shrink-0 w-11 h-11 rounded-xl border-2 border-[var(--gb-border)] flex items-center justify-center hover:border-[var(--gb-text)]">
                    <ListChecks className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <Ring pct={total ? done / total : 0} />
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-lg leading-tight">{!saved.place ? `${total} contests to browse` : allDone ? 'Ballot ready 🎉' : `${done} of ${total} decided`}</p>
                    <button type="button" onClick={changeAddress} className="flex max-w-full items-center gap-1.5 text-sm text-[var(--gb-text)]">
                      <span className="truncate">{saved.place ? `📍 ${saved.place.label}` : 'Browsing every race in Michigan'}</span>
                      <span className="shrink-0 font-bold underline underline-offset-2">{saved.place ? 'Change' : 'Add address'}</span>
                    </button>
                  </div>
                </div>
                {/* Wide screens keep the views, search and notice in the sticky bar; phones let them scroll so the ballot gets the screen. */}
                {wide && tools}
              </div>
            </div>
              {!wide && <div className="max-w-[1100px] mx-auto">{tools}</div>}
            <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start max-w-[1100px] mx-auto pt-4">
              <ContentsColumn {...contents} />
              <ContentsDrawer {...contents} onSection={(id) => { setTab('ballot'); setChosenSection(id); }} open={contentsOpen} onClose={closeContents} />
              <div className="min-w-0 max-w-3xl">

              {tab === 'ballot' && (
                <div className="space-y-8 pt-6">
                  {incoming && (
                    <div role="alertdialog" aria-label="Load saved progress?" className="rounded-2xl border-2 border-[var(--mi-arboretum)] bg-[var(--gb-surface)] p-4 space-y-3">
                      <p className="font-black">Load progress from your saved link?</p>
                      <p className="text-[15px]">It has {Object.keys(incoming.picks).length} decisions. This device has {Object.keys(saved.picks).length}. Loading replaces what’s here.</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setSaved(incoming); setIncoming(null); }} className="min-h-[44px] rounded-xl bg-[var(--mi-arboretum)] px-4 font-black text-white">Load my saved link</button>
                        <button type="button" onClick={() => setIncoming(null)} className="min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">Keep this device’s</button>
                      </div>
                    </div>
                  )}
                  {total > 0 && saved.place && <Trophies ctx={gameCtx} />}
                  <WhereYouVote districts={districts} pin={pin} onChange={changeAddress} />

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
                        {s.id === 'judicial' && <p className="text-[15px] leading-relaxed">These are on the <strong>nonpartisan</strong> part of your ballot: no party labels, and the straight-party box doesn’t cover them. Circuit, district and probate judges for your county aren’t in here yet; your sample ballot has them.</p>}
                        {s.id === 'measures' && <p className="text-[15px] leading-relaxed">Two statewide proposals. Your city, township or school district may add local ones (millages, charter changes); your sample ballot has those.</p>}
                        <div className="kyb-scroll" style={{ ['--scroll' as string]: s.color }}>
                          {s.id === 'measures'
                            ? ballot.measures.map((m) => <MeasureCard key={m.id} color={s.color} m={m} choice={saved.picks[m.id]} onChoose={choose} />)
                            : s.ids.map((id) => (
                              <RaceCard key={id} race={raceById.get(id)!} color={s.color} ink={s.ink} numbered={false} choice={saved.picks[id]} onChoose={choose} onInfo={openSheet} onCompare={openCompare} />
                            ))}
                        </div>
                        {next ? (
                          <button type="button" onClick={() => openSection(next.id)} className="w-full flex items-center justify-between gap-3 min-h-[56px] rounded-2xl px-5 font-black text-lg" style={{ background: next.color, color: next.ink }}>
                            <span>Next: {next.emoji} {next.title}</span><span aria-hidden="true">→</span>
                          </button>
                        ) : (
                          <p className="rounded-2xl border border-[var(--gb-border)] p-4 font-bold">That’s the last section. {allDone ? 'Your ballot is ready to print or share. 🎉' : 'Use the contents to find any races left.'}</p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              {tab === 'how' && (
                <div className="pt-6">
                  <HowBallotWorks storageKey="kyb-mi-how-open" defaultOpen title="How a Michigan ballot works">
                    <p><strong>Three parts.</strong> The partisan section (Congress, governor, Lansing, the school and university boards), the nonpartisan section (judges, plus local offices like city council in many places) and the proposals.</p>
                    <p><strong>The straight-party box.</strong> At the top, one mark votes for every candidate of that party in the partisan section. You can still mark individual races, and those marks win for that race. It never touches the nonpartisan section or the proposals, so look at those either way.</p>
                    <p><strong>“Vote for not more than 2.”</strong> Boards and the Supreme Court elect two seats at once; pick up to two names.</p>
                    <p><strong>Judges with no opponent.</strong> Court of Appeals judges usually run unopposed. Marking them is still a vote; leaving them blank is fine too.</p>
                  </HowBallotWorks>
                </div>
              )}

              {tab === 'feed' && (
                <div className="pt-6">
                  <Feed storageKey="kyb-mi-feed-open" onJump={(id) => jumpTo(sectionFor(id), id)} items={[
                    ...changeItems(data.changes ?? [], (c) => (c.kind === 'money' ? { name: 'FEC and Michigan Bureau of Elections filings', url: data.sources.money.url } : { name: 'Ballotpedia candidate lists', url: 'https://ballotpedia.org/Michigan_elections,_2026' })),
                    ...newsItems(data.news ?? []),
                    ...billItems(data.laws ?? [], billUrl, 'Michigan Legislature'),
                    ...dateItems(KEY_DATES, today(), { name: 'Michigan Department of State', url: LINKS.dates }),
                  ]} />
                </div>
              )}

              {tab === 'plan' && (
                <div className="pt-6 space-y-6">
                  <PlanToVote plan={saved.plan} setPlan={setPlan} county={districts?.county} ballotDone={allDone} />
                  <KeyDates />
                  <button type="button" onClick={() => window.print()} className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-[var(--gb-text)] font-black hover:bg-[var(--kyb-chip)]">
                    <Printer className="w-5 h-5" aria-hidden="true" /> Print My Ballot
                  </button>
                </div>
              )}

              {tab === 'share' && (
                <div className="pt-6 space-y-5">
                  <section className="rounded-2xl border-2 border-[var(--mi-arboretum)] bg-[var(--gb-surface)] p-5 space-y-3" aria-labelledby="kyb-keep">
                    <h2 id="kyb-keep" className="text-2xl font-black leading-tight">💾 Keep your progress</h2>
                    <p className="text-[15px] leading-relaxed">Your picks save on this device automatically. To pick up on another phone or computer, or in case your browser clears its data, save a link: opening it brings everything back.</p>
                    <div className="flex flex-wrap gap-2">
                      {typeof navigator !== 'undefined' && 'share' in navigator && (
                        <button type="button" onClick={() => saveLink(true)} className="min-h-[48px] rounded-xl bg-[var(--mi-arboretum)] px-4 font-black text-white">Send it to myself</button>
                      )}
                      <button type="button" onClick={() => saveLink(false)} className="min-h-[48px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">Copy my link</button>
                    </div>
                    {linkMsg && <p role="status" className="font-bold">{linkMsg}</p>}
                    <p className="text-sm">🔒 The link holds your picks and districts, not your street address. Keep it to yourself.</p>
                  </section>
                  <h2 className="text-2xl font-black leading-tight">Get your people to look up theirs</h2>
                  <p className="text-[15px] leading-relaxed">Share a card with your progress: how many races you’ve researched, section by section. <strong>It never shows who you picked.</strong></p>
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

        {/* The ballot view ends with the sources; the landing page carries them above "Beyond your ballot". */}
        {showBallot && (
          <div className="max-w-[1100px] mx-auto mt-12 space-y-8">
            <Sources />
          </div>
        )}
      </div>

      <PrintBallot sections={sections} picks={saved.picks} label={saved.place?.label} />

      {sheet && (
        <CandidateSheet race={sheet.race} c={sheet.c} color={sectionOf(sheet.race.section).color} ink={sectionOf(sheet.race.section).ink} numbered={false}
          picked={picksFor(sheet.race.id).includes(sheet.c.ballot)}
          onPick={() => togglePick(sheet.race, sheet.c.ballot)}
          onShowRace={showBallot ? undefined : () => { const race = sheet.race; setSheet(null); browse(); jumpTo(race.section, race.id); }}
          onClose={() => setSheet(null)} />
      )}
      {comparing && (
        <Compare race={comparing} color={sectionOf(comparing.section).color} ink={sectionOf(comparing.section).ink} numbered={false} picked={picksFor(comparing.id)}
          onInfo={(c) => { const race = comparing; setComparing(null); openSheet(race, c); }}
          onPick={(b) => togglePick(comparing, b)}
          onClose={() => setComparing(null)} />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 inset-x-4 z-[55] mx-auto max-w-md rounded-2xl bg-[var(--gb-text)] px-5 py-4 text-center font-black text-[var(--gb-bg)] shadow-2xl print:hidden">{toast}</div>
      )}
      {party && <Confetti onDone={() => setParty(false)} />}
    </div>
    </GovbotChrome>
    </ReadOnlyContext.Provider>
    </StateContext.Provider>
  );
}

// ---- pieces ------------------------------------------------------------------------

// The statewide races everyone votes on, for the landing page's quick tour.
const HEADLINERS = data.races.filter((r) => !r.area);
// ...and the rest of the ballot by section, for the cards under them.
const MORE: SectionCard[] = SECTIONS.map((s) => {
  const races = s.id === 'measures' ? [] : data.races.filter((r) => r.section === s.id && r.area);
  return { ...s, n: races.length, hint: 'By district', items: races.map((r) => ({ id: r.id, title: r.office, sub: MICHIGAN.areaLabel(r), race: r })) };
}).filter((c) => c.n > 0);
// The proposals, as a card among the statewide races that flips to the questions.
const PROPOSALS_CARD: SectionCard = { ...SECTIONS.find((s) => s.id === 'measures')!, n: data.measures.length, hint: 'Statewide · yes or no on each', items: data.measures.map((m) => ({ id: m.id, title: m.title, sub: 'Statewide', question: m.question, plain: m.plain })) };

function Landing({ address, setAddress, status, onSubmit, onLocate, onBrowse, onSearchJump, onOpenRace, onOpenCandidate, onOpenSection, place, onContinue, daysLeft, saved, onStartFresh }: {
  address: string; setAddress: (s: string) => void; status: { busy: boolean; error: string; outside: boolean };
  onSubmit: (e: FormEvent) => void; onLocate: () => void; onBrowse: () => void; onSearchJump: (h: Hit) => void; onOpenRace: (r: Race) => void; onOpenCandidate: (r: Race, c: Candidate) => void;
  onOpenSection: (sectionId: string, id: string) => void; /** A saved ballot to go back to. */ place?: string; onContinue: () => void;
  daysLeft: number; saved: number; onStartFresh: () => void;
}) {
  // Spins while the browser finds you and the lookup runs.
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (!status.busy) setLocating(false); }, [status.busy]);
  const [confirming, setConfirming] = useState(false);
  const candidates = data.races.reduce((n, r) => n + r.candidates.length, 0);
  const byDistrict = data.races.length - HEADLINERS.length;
  // Fetch the district maps while the voter types, once the page is idle.
  useEffect(() => {
    if (!('requestIdleCallback' in window)) { const t = setTimeout(prefetchDistricts, 1500); return () => clearTimeout(t); }
    const id = requestIdleCallback(() => { prefetchDistricts(); }, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }, []);
  return (
    <div className="space-y-10 pt-4">
      <header className="flex flex-col-reverse md:flex-row md:items-center gap-6 md:gap-12">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em]">Michigan · 2026 midterms</p>
          <h1 className="text-[40px] sm:text-5xl leading-[1.02]">Know Your Michigan Ballot</h1>
          <p className="font-[family-name:var(--gb-font-display)] text-xl">Every race on your ballot, explained before you vote.</p>
          <p className="font-semibold">
            Election Day: Tue, Nov 3, 2026{daysLeft > 0 ? <> · <span className="rounded-full bg-[var(--gb-primary)] px-2.5 py-0.5 font-bold text-[var(--gb-on-primary)]">{daysLeft} days to go</span></> : daysLeft === 0 ? ' · Today!' : ''}
          </p>
          <ul className="space-y-1 text-[15px] leading-relaxed max-w-[62ch]" aria-label="What you’ll vote on">
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>A new governor, plus secretary of state and attorney general</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>A U.S. Senate seat and your U.S. House seat</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Every seat in the Michigan House and Senate</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>The State Board of Education and the university boards</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Two Supreme Court justices and your Court of Appeals judges</span></li>
            <li className="flex gap-2"><span aria-hidden="true" className="font-black text-[var(--gb-primary)]">&gt;</span><span>Two statewide proposals</span></li>
          </ul>
        </div>
        <div className="w-[240px] md:w-[380px] md:max-w-[42%] shrink-0 self-center"><MichiganMap /></div>
      </header>

      <form onSubmit={onSubmit} className="space-y-3 max-w-3xl">
        <label htmlFor="kyb-address" className="block font-black text-lg">Your address in Michigan</label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" aria-hidden="true" />
            <input id="kyb-address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 2 Woodward Ave, Detroit or 100 N Capitol Ave, Lansing"
              className="w-full min-h-[56px] rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] pl-12 pr-12 text-lg font-bold text-[var(--gb-text)] focus:border-[var(--mi-arboretum)] focus:outline-none" />
            {address && <ClearButton onClear={() => setAddress('')} className="right-2 text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]" />}
          </div>
          <button type="submit" disabled={status.busy} className="shrink-0 min-h-[56px] rounded-2xl bg-[var(--mi-arboretum)] px-5 font-black text-white disabled:cursor-wait inline-flex items-center gap-2">
            <Search className="w-5 h-5" aria-hidden="true" /><span className="hidden sm:inline">{status.busy ? 'Finding…' : 'Find my ballot'}</span><span className="sm:hidden">{status.busy ? '…' : 'Go'}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="button" onClick={() => { setLocating(true); onLocate(); }} disabled={status.busy} aria-busy={locating} className="inline-flex items-center gap-2 min-h-[44px] font-bold underline underline-offset-4 disabled:cursor-wait">
            {locating ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Crosshair className="w-5 h-5" aria-hidden="true" />} {locating ? 'Finding where you are…' : 'Use my current location'}
          </button>
          <Locating show={locating} />
          <button type="button" onClick={onBrowse} className="inline-flex items-center gap-2 min-h-[44px] font-bold underline underline-offset-4">
            <ListChecks className="w-5 h-5" aria-hidden="true" /> No address? Browse every race
          </button>
        </div>
        {place && <ContinueCard label={place} onContinue={onContinue} />}
        {status.error && <p role="alert" className="rounded-xl bg-[var(--gb-red)] px-4 py-3 font-bold text-white">{status.error}</p>}
        {status.outside && (
          <p role="alert" className="rounded-xl bg-[var(--kyb-chip)] border-2 border-[var(--gb-amber-hi)] px-4 py-3 font-bold">
            That address is outside Michigan. This guide covers Michigan voters; Illinois voters have <a className="underline text-[var(--gb-amber-hi)]" href={`${import.meta.env.BASE_URL}projects/know-your-ballot-illinois`}>their own guide</a>.
          </p>
        )}
        {saved > 0 && (
          <div className="rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-3 space-y-2">
            <p className="text-[15px]">You have <strong>{saved} pick{saved === 1 ? '' : 's'}</strong> saved. Same voter, new address? Races on both ballots keep their picks. Looking up someone else’s ballot? Start fresh.</p>
            <button type="button" onClick={() => { if (confirming) { onStartFresh(); setConfirming(false); } else setConfirming(true); }}
              className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${confirming ? 'border-[var(--gb-red)] bg-[var(--gb-red)] text-white' : 'border-[var(--gb-text)]'}`}>
              {confirming ? `Tap again to clear ${saved} pick${saved === 1 ? '' : 's'} and your plan` : 'Start fresh'}
            </button>
          </div>
        )}
        <p className="text-sm leading-relaxed">🔒 Your address goes once to OpenStreetMap’s address search to find your districts, then matching happens on your device. It’s saved only on your device, and never shared or stored anywhere.</p>
      </form>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
        {[[HEADLINERS.length, 'races on every ballot'], [byDistrict, 'races by district'], [candidates, 'candidates'], [data.measures.length, 'statewide proposals']].map(([n, label]) => (
          <li key={label} className="rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-4">
            <span className="block text-3xl font-black">{n}</span>
            <span className="block text-sm font-bold">{label}</span>
          </li>
        ))}
      </ul>

      <div className="max-w-3xl">
        <BallotSearch ballot={everything} sections={SECTION_TITLES} onJump={onSearchJump} />
      </div>

      <Headliners races={HEADLINERS} sections={SECTIONS} overline="On every Michigan ballot" heading="The statewide races"
        intro={`These ${HEADLINERS.length} contests are on every Michigan ballot. Tap a card to meet the candidates; your address adds your own U.S. House, state Senate, state House and Court of Appeals races from the ${byDistrict} by district.`}
        onOpen={onOpenCandidate} onOpenRace={onOpenRace}>
        <SectionFlip card={PROPOSALS_CARD} onOpen={onOpenCandidate} onOpenRace={onOpenRace} onJump={onOpenSection} />
      </Headliners>

      <SectionCards cards={MORE} heading="Everything else on your ballot" intro="By district: your address picks out yours. Tap a section to see every contest in it, who’s running and where." onOpen={onOpenCandidate} onOpenRace={onOpenRace} onJump={onOpenSection} />

      <div className="pt-2 space-y-8">
        <Sources />
        <div role="separator" aria-label="Beyond your ballot" className="flex items-center gap-4">
          <span className="h-[3px] flex-1 rounded-full bg-[var(--gb-text)]" />
          <span className="text-sm font-black uppercase tracking-[0.18em]">Beyond your ballot</span>
          <span className="h-[3px] flex-1 rounded-full bg-[var(--gb-text)]" />
        </div>
        <Laws laws={data.laws ?? []} state={{ code: 'MI', name: 'Michigan', capital: 'Lansing' }} />
        <NextElectionNote />
      </div>
    </div>
  );
}

function WhereYouVote({ districts, pin, onChange }: { districts: Districts | null; pin: { lat: number; lng: number } | null; onChange: () => void }) {
  if (!districts) return null;
  return (
    <div className="rounded-2xl border-[3px] border-[var(--gb-primary)] bg-[var(--gb-surface)] p-4">
      {districts ? (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="font-black">Your districts</p>
            <ul className="flex flex-wrap gap-2">
              {DISTRICT_CHIPS.filter(([k]) => districts[k as keyof Districts]).map(([k, label]) => (
                <li key={k} className="rounded-full border-[3px] border-[var(--gb-primary)] bg-[var(--kyb-chip)] px-3 py-1 text-sm font-bold">{label} {districts[k as keyof Districts]}</li>
              ))}
            </ul>
            <div className="rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--kyb-chip)] p-3 text-[15px] leading-relaxed">
              <p className="font-black text-[var(--gb-amber-hi)]">Not in here yet: your county and local contests</p>
              <p>County commissioners and officials, circuit, district and probate judges, city, township and school board seats, and local millages and proposals. Your sample ballot at <a className="font-bold underline" href={LINKS.myInfo} target="_blank" rel="noreferrer noopener">Michigan.gov/Vote ↗</a> has them all{districts.county ? `, from your ${districts.county} County clerk` : ''}.</p>
            </div>
            <p className="text-sm">
              Not right? Check the <a className="font-bold underline" href={LINKS.myInfo} target="_blank" rel="noreferrer noopener">official lookup ↗</a> or{' '}
              <button type="button" onClick={onChange} className="font-bold underline">change your address</button>.
            </p>
          </div>
          {pin && <div className="hidden sm:block w-36 shrink-0 self-start"><MichiganMap at={pin} /></div>}
        </div>
      ) : null}
    </div>
  );
}

function KeyDates() {
  const now = useNow();
  return (
    <section aria-labelledby="kyb-dates" className="space-y-4">
      <h2 id="kyb-dates" className="text-2xl font-black">Key dates</h2>
      <Group title="Nov 3, 2026 election" dates={KEY_DATES} now={now} info={LINKS.myInfo} />
      <p className="text-sm">All from the <a className="font-bold underline text-[var(--gb-link)]" href={LINKS.dates} target="_blank" rel="noreferrer noopener">Michigan Department of State’s calendar ↗</a>.</p>
    </section>
  );
}

// Where every piece comes from: what each source owns, how fresh it is, and a link to check it.
function Sources() {
  const s = data.sources;
  const [open, toggle] = useOpen('kyb-mi-sources-open');
  const pages = Object.entries(s.candidates.pages);
  const cards: { emoji: string; title: string; status: string; planned?: boolean; body: string; links: [string, string][] }[] = [
    { emoji: '🗳️', title: 'Who’s running', status: `Live · daily · read ${s.candidates.asOf}`,
      body: 'Every statewide, congressional, legislative and Court of Appeals contest from Ballotpedia’s race pages (the university boards from Wikipedia), with incumbents and each candidate’s profile. Both are CC BY-SA. The Secretary of State’s certified listing is the official source; its site refuses automated readers, so check it if a name looks off.',
      links: [...pages.slice(0, 3).map(([office, url]) => [office, url] as [string, string]), ['Official listings by county', LINKS.countyResults]] },
    { emoji: '💵', title: 'Campaign money', status: 'Live · daily',
      body: 'Federal races: raised, spent and cash on hand from each campaign’s latest FEC report. State and local races: every contribution and expenditure in the Michigan Transparency Network’s nightly exports, summed since Jan 2025 for the candidate’s committee (the exports carry no cash-on-hand figure). Both attached only on a confident name, office and district match.',
      links: [['FEC data', s.money.url], ['MiTN exports', s.stateMoney?.url ?? LINKS.disclosure], ['Michigan disclosure search', LINKS.disclosure]] },
    { emoji: '📷', title: 'Photos, websites & social media', status: 'Live · daily',
      body: 'Each candidate’s Ballotpedia profile supplies their photo, campaign website and the accounts Ballotpedia lists as theirs. Official sources win where they overlap: Congress’s portraits, the Legislature’s member photos (via Open States), Wikidata and Wikimedia Commons. Anyone still without a photo gets the headshot their own campaign site labels as them. Every photo is credited on the card; candidates with none anywhere show their initials.',
      links: [['Ballotpedia', 'https://ballotpedia.org/'], ['Congress portraits', 'https://github.com/unitedstates/images'], ['Open States', 'https://openstates.org/mi/']] },
    { emoji: '📜', title: 'Proposals', status: 'Official ballot wording',
      body: 'The two statewide proposals as certified by the Board of State Canvassers, from the League of Women Voters of Michigan’s handout, with a plain-English note on each.',
      links: [['LWV Michigan', s.proposals.lwv], ['Ballotpedia', s.proposals.ballotpedia]] },
    { emoji: '🏛️', title: 'Lansing bills', status: 'Live · from govbot',
      body: 'Michigan bills on elections and schools with action in the last six months, plus the newest of the rest, from govbot’s open legislation data.',
      links: [['govbot', 'https://chihacknight.github.io/govbot/dashboard/legislation.html']] },
    { emoji: '🗺️', title: 'District maps', status: 'Live',
      body: 'Congressional districts (120th Congress), the 2026 Michigan Senate and House maps and county lines from the Census Bureau. Your county sets your Court of Appeals district (MCL 600.302).',
      links: [['Census TIGERweb', 'https://tigerweb.geo.census.gov/']] },
    { emoji: '📍', title: 'Address lookup', status: 'Live',
      body: 'Your address goes to Photon, komoot’s OpenStreetMap geocoder (or OpenStreetMap’s own if it’s down), which answers with coordinates. Districts are matched on your device.',
      links: [['Photon', 'https://photon.komoot.io/'], ['Nominatim', 'https://nominatim.org/']] },
    { emoji: '🗓️', title: 'Dates & rules', status: 'Checked Oct 15, 2026',
      body: 'Registration, early voting, absentee and Election Day rules from the Michigan Department of State.',
      links: [['Michigan.gov/Vote', LINKS.myInfo], ['Election dates', LINKS.dates]] },
    { emoji: '🔄', title: 'What changed', status: 'Daily',
      body: 'Every morning the guide re-reads its sources and notes candidates added or dropped and new money reports, so returning voters see what’s new.',
      links: [] },
    { emoji: '⏳', title: 'Not here yet', status: 'Planned', planned: true,
      body: 'County and local offices, trial-court judges, local proposals and state-level campaign money. Your sample ballot at Michigan.gov/Vote has the contests.',
      links: [['Your sample ballot', LINKS.myInfo]] },
  ];
  return (
    <section id="kyb-sources" aria-labelledby="kyb-sources-h" className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,0px)+16px)] rounded-2xl border-[3px] border-[var(--gb-primary)] bg-[var(--gb-surface)] p-4 sm:p-5">
      <h2 id="kyb-sources-h" className="text-2xl">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="kyb-sources-body" className="inline-flex min-h-[44px] items-center gap-2 text-left">
          📂 Sources
          <ChevronDown className={`w-6 h-6 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">{open ? '(hide)' : '(show)'}</span>
        </button>
      </h2>
      {open && <div id="kyb-sources-body" className="kyb-scroll-bar mt-4 max-h-[420px] overflow-y-auto pr-1" style={{ ['--scroll' as string]: 'var(--gb-primary)' }}>
        <ul className="grid gap-3 sm:grid-cols-2">
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
        <p className="mt-4 text-sm leading-relaxed">Nonpartisan and independent: not affiliated with any campaign, party or election office. Always double-check your <a className="font-bold text-[var(--gb-link)] underline" href={LINKS.myInfo} target="_blank" rel="noreferrer noopener">official sample ballot</a>.</p>
      </div>}
    </section>
  );
}

function PrintBallot({ sections, picks, label }: { sections: { id: SectionId; title: string; ids: string[] }[]; picks: Record<string, Choice>; label?: string }) {
  return (
    <div className="hidden print:block p-6 text-black bg-white text-[11pt]">
      <h1 className="text-xl font-black">My Ballot · Michigan · Nov 3, 2026</h1>
      {label && <p>{label}</p>}
      {sections.map((s) => (
        <section key={s.id} className="mt-4 break-inside-avoid-page">
          <h2 className="font-black border-b border-black">{s.title}</h2>
          <table className="w-full table-fixed">
            <tbody>
              {s.ids.map((id) => { const { what, pick } = describePick(id, picks[id]); return (
                <tr key={id} className="align-top"><td className="w-3/5 py-0.5 pr-4">{what}</td><td className="py-0.5 font-bold">{pick}</td></tr>
              ); })}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mt-4">Michigan voters may bring notes or a marked sample ballot into the voting booth.</p>
    </div>
  );
}
