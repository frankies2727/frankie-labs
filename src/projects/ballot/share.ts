// A share image of the voter's progress. Deliberately never includes picks:
// it says "I did my homework", not "here's how I'm voting".

export interface ShareStats {
  done: number;
  total: number;
  sections: { title: string; color: string; done: number; total: number }[];
  daysLeft: number;
  url: string;
}

const W = 1080;
const H = 1350;

export async function drawShareCard(s: ShareStats): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  g.fillStyle = '#0F1117';
  g.fillRect(0, 0, W, H);

  // Six-colour band across the top, the lab's signature.
  const band = ['#5EBD3E', '#FFB900', '#F78200', '#E23838', '#973999', '#009CDF'];
  band.forEach((col, i) => { g.fillStyle = col; g.fillRect((W / 6) * i, 0, W / 6 + 1, 24); });

  g.fillStyle = '#F5F6F7';
  g.font = font(900, 64);
  g.fillText('I know my ballot.', 80, 160);
  g.font = font(600, 36);
  g.fillText('Chicago · General Election · Nov 3, 2026', 80, 220);

  // Progress ring.
  const cx = W / 2, cy = 470, r = 185, pct = s.total ? s.done / s.total : 0;
  g.lineWidth = 44;
  g.strokeStyle = '#262B34';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#5EBD3E';
  g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#F5F6F7';
  g.font = font(900, 120);
  g.fillText(`${Math.round(pct * 100)}%`, cx, cy + 30);
  g.font = font(700, 36);
  g.fillText(`${s.done} of ${s.total} decided`, cx, cy + 90);
  g.textAlign = 'left';

  // Per-section bars.
  let y = 750; // up to seven sections fit between the ring and the footer
  for (const sec of s.sections) {
    g.fillStyle = '#F5F6F7';
    g.font = font(800, 30);
    g.fillText(sec.title, 80, y);
    g.textAlign = 'right';
    g.fillText(`${sec.done}/${sec.total}`, W - 80, y);
    g.textAlign = 'left';
    g.fillStyle = '#262B34';
    g.fillRect(80, y + 12, W - 160, 14);
    g.fillStyle = sec.color;
    g.fillRect(80, y + 12, (W - 160) * (sec.total ? sec.done / sec.total : 0), 14);
    y += 64;
  }

  g.fillStyle = '#FFB900';
  g.font = font(900, 40);
  g.fillText(s.daysLeft > 0 ? `${s.daysLeft} days left. Look up yours:` : 'Look up yours:', 80, H - 120);
  // Shrink the link until it fits the card.
  const link = s.url.replace(/^https?:\/\//, '');
  let size = 34;
  do { g.font = font(700, size); size -= 1; } while (g.measureText(link).width > W - 160 && size > 16);
  g.fillStyle = '#F5F6F7';
  g.fillText(link, 80, H - 68);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

/** Native share sheet with the image where supported, else a download. */
export async function shareCard(blob: Blob, url: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], 'know-your-ballot.png', { type: 'image/png' });
  const text = 'I looked up every race on my ballot. Know yours before Nov 3:';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const href = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return 'downloaded';
}
