import { Suspense, useEffect } from 'react';
import { EXTERNAL_GAMES, GAMES, externalGameById, gameById } from './games';
import { PROJECTS, projectById } from './projects';
import { Gallery } from './components/Gallery';
import { ProjectsGallery } from './components/ProjectsGallery';
import { GameShell } from './components/GameShell';
import { navigate, useRoute } from './lib/router';

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
  const route = useRoute();
  const seg = route.split('/').filter(Boolean);

  // Legacy /projects → home, which is the same screen now. Replace rather than
  // push so Back doesn't land on the old path and immediately redirect again.
  useEffect(() => {
    if (route === 'projects') navigate('', { replace: true });
  }, [route]);

  // /play/<gameId>
  if (seg[0] === 'play' && seg[1]) {
    const def = gameById(seg[1]);
    if (def) {
      // Keyed by id so each game (re)mounts fresh — a new peer session per visit.
      return <GameShell key={seg[1]} def={def} onExit={() => navigate('games')} />;
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
        <Suspense
          fallback={
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
              <div className="w-16 h-16 border-4 border-white/10 border-t-[#ccff00] rounded-full animate-spin" />
              <p className="text-gray-100 font-mono text-sm uppercase tracking-widest">
                Loading {project.name}…
              </p>
            </div>
          }
        >
          <Project key={seg[1]} onExit={() => navigate('')} />
        </Suspense>
      );
    }
    // Unknown project id → fall through to the projects gallery below.
  }

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
