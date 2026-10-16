import { lazy, Suspense, useEffect, useState } from 'react';
import { EXTERNAL_GAMES, GAMES, externalGameById, hasGame, loadGame } from './games';
import { PROJECTS, projectById } from './projects';
import { BackToTop } from './components/BackToTop';
import { Gallery } from './components/Gallery';
import { ProjectsGallery } from './components/ProjectsGallery';
import { KYB_SITE, navigate, useRoute } from './lib/router';

// Sends the visitor to a separately-hosted project or game (used when its
// in-app URL is opened directly). `replace` keeps the gallery as the back
// target.
function ExternalRedirect({ href }: { href: string }) {
  useEffect(() => { window.location.replace(href); }, [href]);
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 border-4 border-white/10 border-t-[#ccff00] rounded-full animate-spin" />
      <p className="text-gray-100 font-mono text-sm uppercase tracking-widest">Opening…</p>
    </div>
  );
}

// The game shell (lobby, networking) and each game load only when a game is
// opened, so the home page and galleries stay light.
const KybHome = lazy(() => import('./projects/know-your-ballot/KybHome').then((m) => ({ default: m.KybHome })));
const GameShell = lazy(() => import('./components/GameShell').then((m) => ({ default: m.GameShell })));

function Loading({ what }: { what: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 border-4 border-white/10 border-t-[#ccff00] rounded-full animate-spin" />
      <p className="text-gray-100 font-mono text-sm uppercase tracking-widest">Loading {what}…</p>
    </div>
  );
}

function PlayGame({ id }: { key?: string; id: string }) {
  const [def, setDef] = useState<Awaited<ReturnType<typeof loadGame>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGame(id).then((d) => { if (live) setDef(d); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  if (failed) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-100 font-bold">Couldn’t load the game. Check your connection.</p>
        <button type="button" onClick={() => location.reload()} className="min-h-[44px] rounded-xl border-2 border-white px-4 font-bold text-white">Try again</button>
      </div>
    );
  }
  const name = GAMES.find((g) => g.id === id)?.name ?? 'game';
  if (!def) return <Loading what={name} />;
  return (
    <Suspense fallback={<Loading what={name} />}>
      <GameShell def={def} onExit={() => navigate('games')} />
    </Suspense>
  );
}

// URL-driven navigation. Each screen has its own path under the site base:
//   /frankie-labs/                     → the projects gallery (home)
//   /frankie-labs/projects/<projectId> → a project (VibeCheck, AI Art, …)
//   /frankie-labs/games                → the games gallery
//   /frankie-labs/play/<gameId>        → a game (external ones redirect out)
//
// The projects gallery used to live at /projects while games were home; that
// path still resolves (see the canonicalising effect below) so links shared
// before the swap keep working.
export default function App() {
  // Games fill the screen and have their own controls.
  const playing = useRoute().startsWith('play/');
  return <><Screen />{!playing && <BackToTop />}</>;
}

function Screen() {
  const route = useRoute();
  const seg = route.split('/').filter(Boolean);

  // Legacy /projects → home, which is the same screen now. Replace rather than
  // push so Back doesn't land on the old path and immediately redirect again.
  useEffect(() => {
    if (route === 'projects') navigate('', { replace: true });
  }, [route]);

  // /play/<gameId>
  if (seg[0] === 'play' && seg[1]) {
    if (hasGame(seg[1])) {
      // Keyed by id so each game (re)mounts fresh — a new peer session per visit.
      return <PlayGame key={seg[1]} id={seg[1]} />;
    }
    // A separately-hosted game reached by a direct URL / shared link → send the
    // visitor to its real site instead of an empty in-app screen.
    const external = externalGameById(seg[1]);
    if (external) return <ExternalRedirect href={external.href} />;
    // Unknown game id → fall through to the games gallery below.
  }

  // /projects/<id> — a single project. (Bare /projects is handled as home.)
  if (seg[0] === 'projects' && seg[1]) {
    const project = projectById(seg[1]);
    // An external-link project reached by a direct URL / old bookmark → send
    // the visitor to its real site instead of an empty in-app screen.
    if (project && !project.Component && project.href) {
      return <ExternalRedirect href={project.href} />;
    }
    if (project?.Component) {
      const Project = project.Component;
      return (
        <Suspense fallback={<Loading what={project.name} />}>
          <Project key={seg[1]} onExit={() => navigate('')} />
        </Suspense>
      );
    }
    // Unknown project id → fall through to the projects gallery below.
  }

  // On the Know Your Ballot site every other address is the pick-your-state page.
  if (KYB_SITE) return <Suspense fallback={<Loading what="Know Your Ballot" />}><KybHome /></Suspense>;

  // /games, plus any unknown /play/<id>: the games gallery.
  if (seg[0] === 'games' || seg[0] === 'play') {
    return (
      <Gallery
        games={GAMES}
        externalGames={EXTERNAL_GAMES}
        onSelect={(id) => navigate(`play/${id}`)}
        onBack={() => navigate('')}
      />
    );
  }

  // Default: the projects gallery (home).
  return (
    <ProjectsGallery
      projects={PROJECTS}
      onSelect={(id) => navigate(`projects/${id}`)}
      onOpenGames={() => navigate('games')}
    />
  );
}
