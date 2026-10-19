import { useEffect, useState } from 'react';

// A tiny path-based router (no dependency) so each screen has its own URL under
// the site's base — e.g. /frankie-labs/, /frankie-labs/projects, /frankie-labs/projects/ai-art,
// /frankie-labs/play/crossword. Deep links and the browser back/forward button work;
// a public/404.html fallback restores the path on a hard load (GitHub Pages
// serves static files and would otherwise 404 on a non-root path).
//
// Routes are the path *after* the Vite base ("/frankie-labs/"), with no surrounding
// slashes: "" (home = the projects gallery), "games", "projects/<id>",
// "play/<gameId>". "projects" is kept as a legacy alias of home.

const BASE = import.meta.env.BASE_URL; // e.g. "/frankie-labs/" (always ends in "/")

// The Know Your Ballot site (govbot-know-your-ballot.vercel.app, built with
// VITE_KYB_SITE from vercel.json) gives each state's guide a short address:
// /illinois is "projects/know-your-ballot-illinois", /illinois/ballot its
// ballot, and the root is a pick-your-state page (KybHome). Routes inside the
// app don't change; only the address does. See README "Know Your Ballot on
// its own address".
export const KYB_SITE = !!import.meta.env.VITE_KYB_SITE;
const KYB = 'projects/know-your-ballot-';
const toRoute = (path: string) => (KYB_SITE && /^(illinois|michigan)(\/|$)/.test(path) ? KYB + path : path);
const toPath = (route: string) => (KYB_SITE && route.startsWith(KYB) ? route.slice(KYB.length) : route);

export function currentRoute(): string {
  let p = window.location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  else {
    const bare = BASE.replace(/\/$/, '');
    if (bare && p.startsWith(bare)) p = p.slice(bare.length);
  }
  return toRoute(p.replace(/^\/+|\/+$/g, ''));
}

// `replace` swaps the current history entry instead of adding one — use it when
// canonicalising a legacy URL, so the Back button skips the old path rather than
// bouncing the visitor straight back into the redirect.
export function navigate(route: string, opts?: { replace?: boolean }): void {
  const clean = toPath(route.replace(/^\/+|\/+$/g, ''));
  const url = clean ? BASE + clean : BASE;
  if (url !== window.location.pathname) {
    if (opts?.replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    // pushState/replaceState don't emit popstate; nudge listeners so the app re-renders.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

/** The address of a route, for a plain link (a new tab, a share). */
export function routeHref(route: string): string {
  const clean = toPath(route.replace(/^\/+|\/+$/g, ''));
  return clean ? BASE + clean : BASE;
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}
