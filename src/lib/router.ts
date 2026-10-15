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

export function currentRoute(): string {
  let p = window.location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  else {
    const bare = BASE.replace(/\/$/, '');
    if (bare && p.startsWith(bare)) p = p.slice(bare.length);
  }
  return p.replace(/^\/+|\/+$/g, '');
}

// `replace` swaps the current history entry instead of adding one — use it when
// canonicalising a legacy URL, so the Back button skips the old path rather than
// bouncing the visitor straight back into the redirect.
export function navigate(route: string, opts?: { replace?: boolean }): void {
  const clean = route.replace(/^\/+|\/+$/g, '');
  const url = clean ? BASE + clean : BASE;
  if (url !== window.location.pathname) {
    if (opts?.replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    // pushState/replaceState don't emit popstate; nudge listeners so the app re-renders.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
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
