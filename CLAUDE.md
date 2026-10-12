# Working in this repo

## Before calling any change done

Run every change — feature, fix or redesign — through these five questions, and
say what you found when you report back:

1. **Is it built in the most secure way?** No secrets in the repo or the
   browser; outside text escaped before it hits the page.
2. **Is it built in the most efficient way?**
3. **What regressions could it introduce?** Check the other pages, links and
   features that touch the same data or helper, both themes, phone + desktop.
   Prove it: run the tests (`npm run lint`, `npm run build`) and click through
   in a browser.
4. **Is there dead code, duplicate logic or an unused component?** Delete
   leftovers from retired features.
5. **Is anything more complicated than it needs to be?**
