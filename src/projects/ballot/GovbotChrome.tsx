import { useEffect, useState, type ReactNode } from 'react';
import footer from './govbot/footer.html?raw';
import header from './govbot/header.html?raw';
import govbotCss from './govbot/govbot.css?url';

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
const HEADER = fill(header);
const FOOTER = fill(footer);

export function GovbotChrome({ children }: { children: ReactNode }) {
  // govbot's stylesheet styles the whole page, so it's attached only while
  // this page is open (the rest of the lab has its own look), and the page
  // waits for it rather than flash an unstyled header.
  const [styled, setStyled] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    try {
      // The visitor's govbot theme choice (govbot pages set it in <head>).
      const theme = localStorage.getItem('govbot-theme');
      if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    } catch { /* storage blocked: follow the OS */ }
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: govbotCss });
    link.onload = link.onerror = () => setStyled(true);
    document.head.append(link);
    return () => { link.remove(); root.removeAttribute('data-theme'); };
  }, []);
  // The script wires the theme toggle, menus and drawer; it expects the
  // header to be in the page already.
  useEffect(() => { if (styled) import('./govbot/govbot-shell.js'); }, [styled]);
  if (!styled) return null;
  return (
    <>
      {/* display: contents keeps the header sticky to the page, not to a wrapper. */}
      <div className="contents print:hidden" dangerouslySetInnerHTML={{ __html: HEADER }} />
      {children}
      <div className="contents print:hidden" dangerouslySetInnerHTML={{ __html: FOOTER }} />
    </>
  );
}
