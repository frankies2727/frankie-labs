export type GuideState = 'illinois' | 'michigan';

// Each guide's own address when the guides run as their own Vercel projects
// (one project per state, built with VITE_GUIDE=<state>; the names are the
// Vercel project names). On GitHub Pages the guides live under the lab.
const HOSTS: Record<GuideState, string> = {
  illinois: 'https://govbot-il-ballot.vercel.app/',
  michigan: 'https://govbot-mi-ballot.vercel.app/',
};
const MOUNTED = import.meta.env.VITE_GUIDE as GuideState | undefined;

/** The public address of a state's guide (its landing page), for share cards, resume links and the link between the two guides. */
export function guideUrl(state: GuideState): string {
  if (MOUNTED) return state === MOUNTED ? `${location.origin}/` : HOSTS[state];
  return `${location.origin}${import.meta.env.BASE_URL}projects/know-your-ballot-${state}`;
}
