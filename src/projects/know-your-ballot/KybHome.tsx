import { navigate } from '../../lib/router';
import { useDocumentMeta } from './Bits';
import ilOutline from './data/illinois/outline.json';
import { GovbotChrome } from './GovbotChrome';
import { StateMap } from './Hero';
import { MichiganMap } from './michigan/Hero';
import type { Outline } from './types';
import './ballot.css';
import './michigan/michigan.css';

const IL_MAP = { fill: ['var(--gb-blue-hi)', 'var(--gb-primary)', 'var(--gb-blue)'] as [string, string, string], stroke: 'var(--kyb-gold)', pin: 'var(--kyb-gold)', pinStroke: 'var(--gb-bg)' };

/** The root of the Know Your Ballot site: pick your state. Each guide is one tap away at /illinois or /michigan. */
export function KybHome() {
  useDocumentMeta('Know Your Ballot', '🗳️');
  const states = [
    { id: 'illinois', name: 'Illinois', color: 'var(--gb-amber-hi)', blurb: 'Every race, judge and question on your Nov 3, 2026 ballot, from the governor to your precinct.', map: <StateMap outline={ilOutline as Outline} name="Illinois" colors={IL_MAP} id="il-home" /> },
    { id: 'michigan', name: 'Michigan', color: 'var(--gb-primary-hi)', blurb: 'Every race, judge and proposal on your Nov 3, 2026 ballot, from the governor to your school board.', map: <MichiganMap /> },
  ];
  return (
    <GovbotChrome>
      <div className="kyb min-h-[100dvh] bg-[var(--gb-bg)] text-[var(--gb-text)]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-10 pb-24 space-y-8">
          <header className="space-y-3 text-center">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--gb-primary)]">Know Your Ballot · Built on Govbot</p>
            <h1 className="font-serif font-black text-4xl sm:text-5xl leading-tight">Know what&rsquo;s on your ballot before you vote.</h1>
            <p className="text-lg max-w-[60ch] mx-auto">Pick your state. Enter your address and see your exact ballot: every race, who&rsquo;s running, who&rsquo;s funding them, and what each job does.</p>
          </header>
          <ul className="grid gap-5 sm:grid-cols-2" aria-label="States">
            {states.map((s) => (
              <li key={s.id}>
                <a href={`/${s.id}`} onClick={(e) => { e.preventDefault(); navigate(`projects/know-your-ballot-${s.id}`); }}
                  className="group flex h-full flex-col gap-4 rounded-2xl border-[3px] bg-[var(--gb-surface)] p-6 no-underline text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]" style={{ borderColor: s.color }}>
                  <div className="mx-auto w-[160px]">{s.map}</div>
                  <div className="space-y-1 text-center">
                    <span className="block font-serif font-black text-3xl">{s.name}</span>
                    <span className="block text-[15px]">{s.blurb}</span>
                  </div>
                  <span className="mt-auto mx-auto inline-flex min-h-[46px] items-center rounded-xl border-2 px-5 font-black group-hover:bg-[var(--gb-hover)]" style={{ borderColor: s.color }}>Open the {s.name} guide →</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-center text-[15px]">Free, open source and non-partisan. <a className="underline font-bold" href="https://chihacknight.github.io/govbot/" target="_blank" rel="noopener">Built on Govbot ↗</a></p>
        </div>
      </div>
    </GovbotChrome>
  );
}
