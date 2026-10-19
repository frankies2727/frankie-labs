// One headless browser for a build, opened on first need, for sites whose
// firewall turns a plain request away (the Board of Elections' bot check,
// Ballotpedia's challenge page) but lets a real browser through. Playwright
// is installed only where a build needs it (the Illinois workflow); without
// it browserPage answers null and the caller keeps its plain result.

let browser = null;
let unavailable = false;

/** The page as a browser sees it once `looksRight` says the challenge is over; null if it never is, or there is no browser. */
export async function browserPage(url, looksRight, userAgent) {
  if (unavailable) return null;
  if (!browser) {
    try { browser = await (await import('playwright')).chromium.launch(); } catch { unavailable = true; return null; }
  }
  const page = await browser.newPage({ userAgent });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // A challenge resolves itself after a few seconds, then reloads; the
    // document can look right while that reload is still streaming in, so the
    // page is read again once the document is fully parsed (not once every ad
    // script has loaded, which takes half a minute).
    for (let waited = 0; waited < 30_000; waited += 1_000) {
      if (looksRight(await page.content().catch(() => ''))) {
        await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout: 30_000 }).catch(() => {});
        const html = await page.content().catch(() => '');
        if (looksRight(html)) return html;
      }
      await page.waitForTimeout(1_000);
    }
    return null;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}
