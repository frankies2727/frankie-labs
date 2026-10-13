import { Moon, Sun } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import footer from './govbot/footer.html?raw';
import header from './govbot/header.html?raw';
import govbotCss from './govbot/govbot.css?raw';
import govbotJs from './govbot/govbot-shell.js?url';

// govbot's own site shell (header, mobile drawer, footer, stylesheet and
// script), copied from chihacknight/govbot by scripts/ballot/govbot-shell.mjs,
// so this guide looks and works like the rest of govbot. Here its links point
// at the live govbot site; on govbot itself the page carries the shell
// directly and govbot keeps it in sync.

const SITE = 'https://chihacknight.github.io/govbot/';
/** govbot's images (the Capitol, the logo). */
export const GOVBOT_ASSETS = `${SITE}dashboard/assets/`;
// Our own copy, not outside text: the templates' {placeholders} become links.
const fill = (template: string) =>
  template.slice(template.indexOf('-->') + 3)
    .replaceAll('{HOME}', SITE).replaceAll('{ROOT}', SITE).replaceAll('{DASH}', `${SITE}dashboard/`);
// govbot's theme button makes way for the lab's own (ThemeToggle, below).
const HEADER = fill(header).replace(/<button class="gb-icon-btn" data-gb-theme-toggle[\s\S]*?<\/button>/, '<span class="contents" data-kyb-theme></span>');
const FOOTER = fill(footer);

// Drawn once and never again: a re-render could rewrite the HTML and drop the
// theme switch placed into it. display: contents keeps the header sticky to
// the page, not to a wrapper.
const Static = memo(function Static({ html }: { html: string }) {
  return <div className="contents print:hidden" dangerouslySetInnerHTML={{ __html: html }} />;
});

// The light/dark switch is the lab's own, not govbot's script: it sets the
// same data-theme attribute govbot's colours follow, remembers the choice and
// shows which theme you'd switch to.
type Theme = 'light' | 'dark';
const THEME_KEY = 'kyb-theme';
function startTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage blocked */ }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === 'dark';
  return (
    <button type="button" onClick={onToggle} className="gb-icon-btn" aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
      {dark ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
    </button>
  );
}

// govbot's stylesheet goes into Tailwind's base layer, so it styles the page
// but never outranks the guide's own utility classes (unlayered, its plain
// `a { color }` turned every link blue whatever colour the guide asked for).
// Its one @import (fonts) has to stay outside the layer, at the top.
// (Its URL has semicolons of its own, so match through the closing paren.)
const FONT_IMPORT = govbotCss.match(/^@import url\([^)]*\);/m)?.[0] ?? '';
const GOVBOT_STYLE = `${FONT_IMPORT}\n@layer base {\n${govbotCss.replace(FONT_IMPORT, '')}\n}`;

export function GovbotChrome({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(startTheme);
  useEffect(() => {
    // Switch colours in one go: with transitions on, hundreds of elements
    // would each animate to the new colour, restyling the page every frame.
    const root = document.documentElement;
    root.classList.add('kyb-theme-switch');
    root.setAttribute('data-theme', theme);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('kyb-theme-switch')));
    return () => { cancelAnimationFrame(id); root.classList.remove('kyb-theme-switch'); };
  }, [theme]);
  const toggleTheme = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ }
    return next;
  });
  // Where the switch goes: the spot govbot's own switch held in its header.
  const [themeSlot, setThemeSlot] = useState<Element | null>(null);

  // govbot's stylesheet styles the whole page, so it's attached only while
  // this page is open (the rest of the lab has its own look).
  const [styled, setStyled] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const style = Object.assign(document.createElement('style'), { textContent: GOVBOT_STYLE });
    document.head.append(style);
    // A class for page-wide rules (ballot.css), cheaper than :has(.gb-header),
    // which the browser rechecks on every change to the page.
    root.classList.add('kyb-govbot');
    setStyled(true);
    return () => { style.remove(); root.classList.remove('kyb-govbot'); root.removeAttribute('data-theme'); };
  }, []);
  // The script wires the menus and drawer to the header in the page, so it
  // runs again each time this page opens (a module import would run only the
  // first time, leaving a later visit's header dead).
  useEffect(() => {
    if (!styled) return;
    setThemeSlot(document.querySelector('.gb-header [data-kyb-theme]'));
    const script = Object.assign(document.createElement('script'), { src: govbotJs });
    document.body.append(script);
    return () => script.remove();
  }, [styled]);
  if (!styled) return null;
  return (
    <>
      <Static html={HEADER} />
      {themeSlot && createPortal(<ThemeToggle theme={theme} onToggle={toggleTheme} />, themeSlot)}
      {children}
      <Static html={FOOTER} />
    </>
  );
}
