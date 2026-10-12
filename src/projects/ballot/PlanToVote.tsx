import { CalendarPlus, Check, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EarlyVotingSite } from './types';

// Chicago dates, hours and rules are from the Chicago Board of Elections
// (chicagoelections.gov early voting, vote by mail and Election Day pages, and
// its 2026 election calendar), checked October 12, 2026. For suburban Cook we
// state only what Illinois law fixes statewide (registration Oct 18 online,
// mail applications by Oct 29, early voting through Nov 2, polls 6am–7pm)
// and send voters to the County Clerk for sites and hours.
const CBOE = 'https://chicagoelections.gov/voting';
export const LINKS = {
  myInfo: `${CBOE}/your-voter-information`,
  registerOnline: 'https://ova.elections.il.gov/',
  mail: `${CBOE}/vote-mail`,
  dropBoxes: `${CBOE}/drop-boxes`,
  early: `${CBOE}/early-votingvote-centers`,
  electionDay: `${CBOE}/election-day-voting`,
  id: `${CBOE}/when-you-need-id-vote`,
  addressLookup: 'https://chicagoelections.gov/voter-info/address-lookup',
  stateLookup: 'https://ova.elections.il.gov/RegistrationLookup.aspx',
};

type Method = 'early' | 'mail' | 'day';
const METHODS: { id: Method; label: string; emoji: string }[] = [
  { id: 'early', label: 'Vote early', emoji: '🗓️' },
  { id: 'mail', label: 'Vote by mail', emoji: '✉️' },
  { id: 'day', label: 'Election Day', emoji: '🇺🇸' },
];


interface Props {
  plan: Record<string, boolean | string>;
  setPlan: (key: string, value: boolean | string) => void;
  /** Chicago voters get the Chicago Board's specifics; suburban Cook, the statewide rules + the Clerk. */
  chicago: boolean;
  clerk: string;
  ward?: string;
  wardSite?: EarlyVotingSite;
  ballotDone: boolean;
}

function Step({ n, done, title, children, onToggle }: { n: number; done: boolean; title: string; children: ReactNode; onToggle?: () => void }) {
  return (
    <li className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] p-5">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onToggle}
          disabled={!onToggle}
          aria-pressed={done}
          aria-label={done ? `Step ${n} done` : `Mark step ${n} done`}
          className={`shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center font-black text-lg transition-colors ${done ? 'bg-[#5EBD3E] border-[#5EBD3E] text-[#0F1117]' : 'border-[#F5F6F7] text-[#F5F6F7]'}`}
        >
          {done ? <Check className="w-6 h-6" strokeWidth={3} /> : n}
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <h3 className="text-lg font-black leading-tight text-[#F5F6F7]">{title}</h3>
          <div className="space-y-3 text-[15px] leading-relaxed text-[#E2E4E8]">{children}</div>
        </div>
      </div>
    </li>
  );
}

const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-bold text-[#009CDF] underline underline-offset-2 hover:text-[#F5F6F7]">
    {children}<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
  </a>
);

// Suburban Cook early-voting sites and hours are set by the County Clerk; we
// only state what Illinois law fixes everywhere (it ends the day before).
const REMINDERS = {
  wardSites: { when: ['20261019T090000', '20261019T100000'], what: 'Vote early (ward sites open today)', label: 'Remind me Oct 19' },
  lastEarly: { when: ['20261102T090000', '20261102T100000'], what: 'Last day of early voting', label: 'Remind me Nov 2' },
  day: { when: ['20261103T060000', '20261103T070000'], what: 'Vote! Polls open 6am–7pm', label: 'Remind me Nov 3' },
};

// A plain .ics so the reminder lands in whatever calendar the voter uses.
// Floating local times: everyone using this is in Cook County.
function downloadReminder(r: (typeof REMINDERS)[keyof typeof REMINDERS], info: string) {
  const { when, what } = r;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Frankie Labs//Know Your Ballot//EN',
    'BEGIN:VEVENT', `UID:kyb-${when[0]}@frankie-labs`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${when[0]}`, `DTEND:${when[1]}`, `SUMMARY:${what}`,
    `DESCRIPTION:Bring your My Ballot notes. Info: ${info}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${what}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'vote-reminder.ics' });
  a.click();
  URL.revokeObjectURL(url);
}

export function PlanToVote({ plan, setPlan, chicago, clerk, ward, wardSite, ballotDone }: Props) {
  const method = (plan.method as Method) || null;
  const reminder = method === 'early' ? (chicago ? REMINDERS.wardSites : REMINDERS.lastEarly) : REMINDERS.day;
  const reminderInfo = chicago ? (method === 'early' ? LINKS.early : LINKS.electionDay) : clerk;
  return (
    <ol className="space-y-4">
      <Step n={1} done={!!plan.registered} title="Make sure you’re registered" onToggle={() => setPlan('registered', !plan.registered)}>
        {chicago
          ? <p>Check your registration, sample ballot and polling place on the <Out href={LINKS.myInfo}>Board of Elections site</Out>.</p>
          : <p>Check your registration and polling place with the <Out href={LINKS.stateLookup}>State Board of Elections</Out>; your sample ballot is on the <Out href={clerk}>Cook County Clerk’s site</Out>.</p>}
        <p><strong className="text-[#FFB900]">Not registered or moved?</strong> Register online through <strong>Sun, Oct 18</strong> at <Out href={LINKS.registerOnline}>ova.elections.il.gov</Out>. After that, register in person when you vote early or on Election Day. Bring two IDs, one showing your current address{chicago ? <> (<Out href={LINKS.id}>which IDs count</Out>)</> : null}.</p>
      </Step>

      <Step n={2} done={!!method} title="Pick how you’ll vote">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How you'll vote">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setPlan('method', m.id)}
              className={`min-h-[64px] rounded-xl border-2 px-2 py-2 font-bold text-sm leading-tight transition-colors ${method === m.id ? 'border-[#5EBD3E] bg-[#5EBD3E] text-[#0F1117]' : 'border-[#2E343F] bg-[#262B34] text-[#F5F6F7] hover:border-[#F5F6F7]'}`}
            >
              <span className="block text-xl" aria-hidden="true">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
        {method === 'early' && !chicago && (
          <div className="space-y-2">
            <p><strong>Early voting runs through Mon, Nov 2.</strong> In suburban Cook, the County Clerk sets the sites and hours. <Out href={clerk}>Find a site</Out></p>
          </div>
        )}
        {method === 'mail' && !chicago && (
          <div className="space-y-2">
            <p><strong>Apply by Thu, Oct 29</strong> through the <Out href={clerk}>Cook County Clerk</Out>, then return your ballot by mail or at a drop box.</p>
          </div>
        )}
        {method === 'day' && !chicago && (
          <div className="space-y-2">
            <p><strong>Tue, Nov 3, 6am–7pm</strong> at your polling place. <Out href={LINKS.stateLookup}>Look it up</Out></p>
            <p>In line by 7pm? You get to vote.</p>
          </div>
        )}
        {method === 'early' && chicago && (
          <div className="space-y-2">
            {wardSite ? (
              <p><strong className="text-[#5EBD3E]">Your Ward {ward} site:</strong> {wardSite.site}, {wardSite.address}.{wardSite.language ? ` Bilingual help: ${wardSite.language}.` : ''}</p>
            ) : null}
            <p><strong>All 50 ward sites, from Mon, Oct 19:</strong> Mon–Fri 9am–6pm, Sat 9am–5pm, Sun 10am–4pm, through Mon, Nov 2.</p>
            <p><strong>Downtown, open now:</strong> Voting Supersite at 137 S. State St. Mon–Fri 9am–6pm (7pm from Oct 26), Sat 9am–5pm, Sun 10am–4pm.</p>
            <p>Any Chicago voter can use any early voting site. <Out href={LINKS.early}>All sites</Out></p>
          </div>
        )}
        {method === 'mail' && chicago && (
          <div className="space-y-2">
            <p><strong>Apply by Thu, Oct 29</strong> with the <Out href={LINKS.mail}>online application</Out>. Your ballot comes with a postage-paid return envelope, and the Board emails you as it’s mailed, received and counted.</p>
            <p>Return it by mail or at a <Out href={LINKS.dropBoxes}>drop box</Out>.</p>
          </div>
        )}
        {method === 'day' && chicago && (
          <div className="space-y-2">
            <p><strong>Tue, Nov 3, 6am–7pm.</strong> Vote at your assigned precinct polling place, or at any of 51 vote centers (the 50 ward sites plus 137 S. State St.).</p>
            <p>In line by 7pm? You get to vote. <Out href={LINKS.electionDay}>Election Day info</Out></p>
          </div>
        )}
      </Step>

      <Step n={3} done={!!plan.reminder} title="Put it on your calendar">
        <button
          type="button"
          disabled={!method || method === 'mail'}
          onClick={() => { downloadReminder(reminder, reminderInfo); setPlan('reminder', true); }}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border-2 border-[#F5F6F7] bg-[#262B34] px-4 font-bold text-[#F5F6F7] hover:bg-[#323A47] disabled:cursor-not-allowed disabled:border-[#2E343F]"
        >
          <CalendarPlus className="w-5 h-5" aria-hidden="true" />
          {reminder.label}
        </button>
        {method === 'mail' && <p>Voting by mail? Set your own reminder to send it back as soon as it arrives.</p>}
        {!method && <p>Pick how you’ll vote first.</p>}
      </Step>

      <Step n={4} done={ballotDone} title="Bring your notes">
        <p>Finish <strong>My Ballot</strong> and bring it along: Illinois voters have the right to use sample ballots, endorsements or notes while voting.</p>
        <p>{ballotDone ? '✅ Your ballot is ready.' : 'Your ballot isn’t finished yet; it checks itself off when it is.'}</p>
      </Step>
    </ol>
  );
}
