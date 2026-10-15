import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThemeToggle, useGuideTheme } from '../GovbotChrome';

// The Michigan guide's own header and footer, on the same tokens and theme
// switch as the Illinois guide (which wears govbot's shell instead).

export function MichiganChrome({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  const { theme, toggleTheme, styled } = useGuideTheme();
  if (!styled) return null;
  return (
    <>
      <header className="mi-header print:hidden">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 min-h-[44px] rounded-full px-3 font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Frankie Labs</span><span className="sm:hidden">Lab</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-center font-[family-name:var(--gb-font-display)] text-lg font-semibold">
          🧤 Know Your Ballot <span className="hidden sm:inline">· Michigan</span>
        </p>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      {children}
      <footer className="print:hidden border-t border-[var(--gb-border)] px-4 py-8 text-center text-sm text-[var(--gb-text)]">
        <p className="max-w-[60ch] mx-auto leading-relaxed">Nonpartisan and independent: not affiliated with any campaign, party or election office. Your picks never leave this device. A Frankie Labs project; the <a className="font-bold underline" href={`${import.meta.env.BASE_URL}projects/know-your-ballot-illinois`}>Illinois guide</a> is built the same way.</p>
      </footer>
    </>
  );
}
