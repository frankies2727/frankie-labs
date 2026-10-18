import { KYB_SITE } from '../../lib/router';

export type GuideState = 'illinois' | 'michigan';

/**
 * The public address of a state's guide (its landing page), for share cards,
 * resume links and the link between the two guides: /<state> on the Know Your
 * Ballot site, the project's page under the lab on GitHub Pages.
 */
export function guideUrl(state: GuideState): string {
  return KYB_SITE ? `${location.origin}/${state}` : `${location.origin}${import.meta.env.BASE_URL}projects/know-your-ballot-${state}`;
}

/** govbot's legislation explorer: `#state=il&q=<name>` lists every bill carrying a name. */
export const GOVBOT_LEGISLATION = 'https://chihacknight.github.io/govbot/dashboard/legislation.html';
