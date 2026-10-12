import { CSSProperties, useState } from 'react';
import { ProjectDefinition } from '../projects/types';
import { PikachuIcon } from './PikachuIcon';

// Monthly hero image for the home screen.
//
// This points at a fixed, stable path — drop (or replace) a single file at
// `public/projects/homescreen.jpg` via GitHub → Add file → Upload files and it
// shows up here automatically, no code change needed. Swap it whenever you like
// (e.g. a fresh one every month). If the file isn't there, the gallery falls
// back to the Pikachu header, so nothing breaks when the slot is empty.
//
// Prefer a different format? Change the extension on this one line to
// `homescreen.png` / `homescreen.webp` and upload with that name.
const HOMESCREEN_IMAGE = `${import.meta.env.BASE_URL}projects/homescreen.jpg`;

// Swappable icon for the top-right games portal button.
//
// Like the hero image, this points at a fixed, stable path — drop (or replace)
// a single file at `public/projects/icon.png` via GitHub → Add file → Upload
// files and it shows up here automatically, no code change needed. If the file
// isn't there, the button falls back to the built-in Pikachu icon, so nothing
// breaks when the slot is empty. (The path still says `projects/` because that
// is where the file already lives — renaming it would orphan the upload.)
//
// A small square image with a transparent background looks best. Prefer another
// format? Change the extension on this one line (e.g. `icon.jpg` / `icon.webp`).
const GAMES_ICON = `${import.meta.env.BASE_URL}projects/icon.png`;

interface ProjectsGalleryProps {
  projects: ProjectDefinition[];
  onSelect: (id: string) => void;
  onOpenGames: () => void;
}

export function ProjectsGallery({ projects, onSelect, onOpenGames }: ProjectsGalleryProps) {
  // Assume the monthly image is present; if it 404s we fall back to Pikachu.
  const [heroFailed, setHeroFailed] = useState(false);
  // Same for the custom games icon.
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#0F1117] text-[#E2E4E8] font-sans selection:bg-[#262B34] px-4 py-12 sm:py-16">
      {/* Floating portal → the games gallery. */}
      <button
        onClick={onOpenGames}
        title="Play a game"
        aria-label="Open the games gallery"
        style={{ '--fill': 'rgb(26 29 36 / 0.9)' } as CSSProperties}
        className="rainbow-border group fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full backdrop-blur-md pl-1.5 pr-1.5 sm:pr-3 py-1.5 shadow-[3px_3px_0px_#454C5A] hover:shadow-[1px_1px_0px_#454C5A] hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
      >
        <span className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 drop-shadow-[0_0_6px_rgba(247,208,44,0.5)] group-hover:animate-bounce">
          {iconFailed ? (
            <PikachuIcon className="w-full h-full" />
          ) : (
            <img
              src={GAMES_ICON}
              alt="Games"
              onError={() => setIconFailed(true)}
              className="w-full h-full object-contain rounded-full"
            />
          )}
        </span>
        <span className="hidden sm:inline text-[10px] font-mono font-bold uppercase tracking-widest text-[#F5F6F7]">
          Games
        </span>
      </button>

      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-12 sm:mb-16">
          {heroFailed ? (
            <div className="flex items-center justify-center mb-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_25px_rgba(247,208,44,0.35)]">
                <PikachuIcon className="w-full h-full" />
              </div>
            </div>
          ) : (
            <div className="mb-8 sm:mb-10">
              <img
                src={HOMESCREEN_IMAGE}
                alt="Frankie Labs"
                onError={() => setHeroFailed(true)}
                className="w-full max-h-64 sm:max-h-80 object-cover rounded-3xl border border-white/10 shadow-2xl"
              />
            </div>
          )}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tighter uppercase italic text-[#F5F6F7]">
            Frankie Labs
          </h1>
          <p className="text-xs sm:text-sm font-mono uppercase tracking-[0.3em] text-[#E2E4E8] mt-4">
            A lab of awesome things I&apos;m building · pick one
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {projects.map((project) => {
            const cardClass = `group relative overflow-hidden text-left rounded-3xl p-7 min-h-[240px] flex flex-col shadow-lg hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all border border-white/10 bg-gradient-to-br ${project.gradient}`;
            const inner = (
              <>
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 transition-colors duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                {/* The emoji lives in normal flow and mb-auto pushes the copy to
                    the bottom, so a long description can never grow up under it
                    and collide with the title. */}
                <span className="relative z-10 mb-auto w-12 h-12 flex items-center justify-center text-2xl rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
                  {project.emoji}
                </span>

                <div className="relative z-10 mt-6">
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white drop-shadow-md">
                    {project.name}
                  </h2>
                  <p className="text-sm text-white mt-2 leading-snug drop-shadow-sm">
                    {project.description}
                  </p>
                  <span className="inline-block mt-4 text-[10px] font-mono font-bold uppercase tracking-widest text-white group-hover:translate-x-1 transition-transform">
                    {project.href ? 'Visit ↗' : 'Open →'}
                  </span>
                </div>
              </>
            );

            // External projects (a separately-hosted site) open in a new tab;
            // in-app projects route to their full-screen screen.
            return project.href ? (
              <a key={project.id} href={project.href} target="_blank" rel="noreferrer noopener" className={cardClass}>
                {inner}
              </a>
            ) : (
              <button key={project.id} onClick={() => onSelect(project.id)} className={cardClass}>
                {inner}
              </button>
            );
          })}
        </div>

        <footer className="text-center mt-16 text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
          More projects landing soon
        </footer>
      </div>
    </div>
  );
}
