import { CalendarPlus } from 'lucide-react';
import { dayLabel, downloadReminder } from '../dates';
import { Out, Step } from '../PlanToVote';
import { LINKS } from './config';
import { byId } from './dates';

// Michigan's rules, from the Michigan Department of State (register-to-vote,
// absentee-voting and early-in-person-voting pages), checked October 15, 2026.

type Method = 'early' | 'absentee' | 'day';
const METHODS: { id: Method; label: string; emoji: string }[] = [
  { id: 'early', label: 'Vote early', emoji: '🗓️' },
  { id: 'absentee', label: 'Absentee (by mail)', emoji: '✉️' },
  { id: 'day', label: 'Election Day', emoji: '🇺🇸' },
];

interface Props {
  plan: Record<string, boolean | string>;
  setPlan: (key: string, value: boolean | string) => void;
  /** The voter's county, once known. */
  county?: string;
  ballotDone: boolean;
}

export function PlanToVote({ plan, setPlan, county, ballotDone }: Props) {
  const method = (plan.method as Method) || null;
  const reminder = byId(method === 'early' ? 'early-opens' : method === 'absentee' ? 'absentee' : 'election');
  return (
    <ol className="space-y-4">
      <Step n={1} done={!!plan.registered} title="Make sure you’re registered" onToggle={() => setPlan('registered', !plan.registered)}>
        <p>Check your registration, see your sample ballot and find your polling place at <Out href={LINKS.myInfo}>Michigan.gov/Vote</Out>{county ? <> (your election is run by your city or township clerk in {county} County)</> : null}.</p>
        <p><strong className="text-[var(--gb-amber-hi)]">Not registered or moved?</strong> Register online or by mail through <strong>Mon, Oct 19</strong>. After that, go to your clerk’s office in person with proof of where you live (a license, a bill, a lease) right up to <strong>8pm on Election Day</strong>, and vote there and then. <Out href={LINKS.register}>How to register</Out></p>
      </Step>

      <Step n={2} done={!!method} title="Pick how you’ll vote">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How you'll vote">
          {METHODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id} onClick={() => setPlan('method', m.id)}
              className={`min-h-[64px] rounded-xl border-2 px-2 py-2 font-bold text-sm leading-tight transition-colors ${method === m.id ? 'border-[var(--gb-primary)] bg-[var(--gb-primary)] text-[var(--gb-bg)]' : 'border-[var(--gb-border)] bg-[var(--kyb-chip)] text-[var(--gb-text)] hover:border-[var(--gb-text)]'}`}>
              <span className="block text-xl" aria-hidden="true">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
        {method === 'early' && (
          <div className="space-y-2">
            <p><strong>Sat, Oct 24 through Sun, Nov 1</strong>, at least eight hours a day. You get a regular ballot and feed it into the tabulator yourself, just like Election Day.</p>
            <p>Every community has an early voting site (some share one). Sites and hours are at <Out href={LINKS.myInfo}>Michigan.gov/Vote</Out>. <Out href={LINKS.early}>How early voting works</Out></p>
          </div>
        )}
        {method === 'absentee' && (
          <div className="space-y-2">
            <p>Any Michigan voter can vote absentee, no reason needed. <strong>Apply online or by mail by Fri, Oct 30 at 5pm</strong>, or in person at your clerk’s office by Mon, Nov 2 at 4pm. Ballots have been going out since Sep 24. <Out href={LINKS.absentee}>Apply</Out></p>
            <p>Return it by mail (allow a week), at an official drop box, or at your clerk’s office, so it arrives <strong>by 8pm on Nov 3</strong>. You can also take it to your early voting site or polling place and feed it into the tabulator yourself (except in Detroit). Track it at <Out href={LINKS.myInfo}>Michigan.gov/Vote</Out>.</p>
            <p>Tick the box on the application to join the permanent absentee list and get a ballot mailed for every election.</p>
          </div>
        )}
        {method === 'day' && (
          <div className="space-y-2">
            <p><strong>Tue, Nov 3, 7am–8pm</strong> at your assigned polling place. <Out href={LINKS.myInfo}>Look it up</Out></p>
            <p>In line by 8pm? You get to vote. Bring a photo ID if you have one; if you don’t, you sign a short affidavit and vote a regular ballot.</p>
          </div>
        )}
      </Step>

      <Step n={3} done={!!plan.reminder} title="Put it on your calendar">
        <button type="button" disabled={!method}
          onClick={() => { downloadReminder(reminder, LINKS.myInfo); setPlan('reminder', true); }}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] bg-[var(--kyb-chip)] px-4 font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip-hi)] disabled:cursor-not-allowed disabled:border-[var(--gb-border)]">
          <CalendarPlus className="w-5 h-5" aria-hidden="true" />
          Remind me {dayLabel(reminder.date).replace(/^\w+, /, '')}
        </button>
        {method === 'absentee' && <p>That’s the application deadline. Send the ballot back the day it arrives.</p>}
        {!method && <p>Pick how you’ll vote first.</p>}
      </Step>

      <Step n={4} done={ballotDone} title="Bring your notes">
        <p>Finish <strong>My Ballot</strong> and bring it along. Michigan lets you take notes or a marked-up sample ballot into the booth; just keep them to yourself.</p>
        <p>{ballotDone ? '✅ Your ballot is ready.' : 'Your ballot isn’t finished yet; it checks itself off when it is.'}</p>
      </Step>
    </ol>
  );
}
