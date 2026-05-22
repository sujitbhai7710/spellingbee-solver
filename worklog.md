
---
Task ID: redesign-1
Agent: Main Agent
Task: Complete professional redesign of Spelling Bee Solver website

Work Log:
- Visited live site with Playwright + VLM to identify all issues
- Visited NYT Spelling Bee site with Playwright for design reference
- Identified issues: broken hexagon positioning, dates showing old data, poor design quality
- Completely rewrote all CSS (global.css) with professional design system
- Created SVG-based Honeycomb.astro component (replaces broken CSS clip-path approach)
- Rewrote BaseLayout.astro with new header, footer, Inter font, dark theme nav
- Rewrote index.astro with hero section (dark gradient + hex pattern bg)
- Rewrote today.astro, yesterday.astro, archive.astro, stats.astro with new design
- Built interactive solver page with dual input modes (hexagon + text)
- Added interactive SVG hexagon input for solver (click hex, type letter)
- Fixed date display - now correctly shows 2025 dates from API
- Added proper .gitignore
- Deployed to Cloudflare Pages (spellingbee-solver.pages.dev)
- Pushed to GitHub (sujitbhai7710/spellingbee-solver)
- VLM rating: 8.5/10 for design quality

Stage Summary:
- All 6 pages completely redesigned with professional look
- SVG honeycomb replaces broken CSS clip-path approach
- Interactive solver with hexagon input + text input tabs
- Dark gradient hero section with hex pattern background
- Proper Inter font, card system, stat cards, word chips, pangram chips
- Deployed and tested on Cloudflare Pages

---
Task ID: fix-2
Agent: Main Agent
Task: Fix hexagon design, solver page, autofill, brand name bugs

Work Log:
- Visited nytbee.com with Playwright to identify all features/data they show
- Visited beesolver.com with Playwright and downloaded hexagon source code structure
- Visited sbsolver.online (our deployed site) to identify current visual issues
- Visited NYT Spelling Bee official site for hexagon reference
- Found bugs: today page showing "SbAnswer.com" brand, broken hexagon positioning, missing autofill button, solver page poor design
- Rewrote Honeycomb.astro using beesolver.com's CSS-based approach (absolute positioning + transforms)
- Rewrote solver.astro with beesolver.com-style interactive hexagon inputs inside each hex cell
- Added Autofill Today's NYT Puzzle button (fetches from /today API endpoint)
- Fixed today.astro title (was "SbAnswer.com" now "SB Solver")
- Fixed BaseLayout.astro title format
- Updated [slug].astro to use new CSS hexagon display
- Updated global.css with beesolver.com-style honeycomb CSS
- Built and deployed to Cloudflare Pages (spellingbee-solver.pages.dev)
- Pushed to GitHub (sujitbhai7710/spellingbee-solver)
- Added sbsolver.online as custom domain to Cloudflare Pages project
- Tested: solver hexagon input works, autofill works (fills N,B,D,E,L,M,O), solve returns 124 words
- NOTE: sbsolver.online currently points to old Vercel deployment (different Cloudflare account), needs DNS update

Stage Summary:
- Hexagon completely redesigned using beesolver.com CSS approach (transforms instead of SVG pixel offsets)
- Solver page now has interactive hexagons with input fields inside each cell
- Autofill button fetches today's puzzle from API and auto-solves
- Brand name bug fixed (SbAnswer.com → SB Solver)
- Deployed to Cloudflare Pages, but sbsolver.online DNS needs updating from Vercel to CF Pages
---
Task ID: 1
Agent: Main Agent
Task: Complete overhaul of SbSolver website - fix all bugs, add features, SEO optimization

Work Log:
- Fixed API date bug: Modified getLatestPuzzle() in worker to filter by `date_iso <= todayISO`, preventing future puzzles from showing
- Fixed `/api/last/:count` endpoint to also filter future puzzles
- Deployed worker fix to Cloudflare Workers
- Fixed Perfect Pangram rendering: Changed `&#10003;` to "Yes" or em-dash across today, yesterday, and [slug] pages
- Fixed brand name: Changed all page titles from "SbAnswer.com" to "SbSolver" in BaseLayout.astro
- Fixed stats page crash: Added `safeLocale()` and `safeNum()` helper functions to handle undefined/null values that caused toLocaleString() errors
- Added spoiler "Show All Answers" button on today and yesterday pages (nytbee.com feature)
- Added "Words by First Letter" section with bar charts (nytbee.com feature)
- Added Genius threshold display in puzzle stats
- Added Perfect Pangram highlight section with green styling
- Added Date Picker + "Go!" button on archive page (nytbee.com feature)
- Added FAQ sections with FAQPage schema on today, yesterday, stats, and archive pages
- Added HowTo schema on solver page
- Added WebSite schema on home page
- Rewrote solver page with 1500+ words of SEO content, HowTo guide, comprehensive FAQ
- Rewrote today page with 600+ words SEO content, detailed puzzle breakdown, FAQ
- Rewrote yesterday page with SEO content and FAQ
- Rewrote stats page with SEO content and FAQ
- Rewrote archive page with date picker, SEO content, and FAQ
- Rewrote home page with 600+ words SEO content about Spelling Bee
- Added Open Graph and Twitter Card meta tags to BaseLayout
- Added author meta tag for E-E-A-T
- Added canonical URL tags
- Deployed to Cloudflare Pages (spellingbee-solver.pages.dev)
- Pushed to GitHub

Stage Summary:
- All critical bugs fixed (dates, brand, stats crash, ✓ character)
- nytbee.com features implemented: spoiler reveal, date picker, words by first letter, genius threshold, puzzle stats header
- Comprehensive SEO with FAQ schema, HowTo schema, WebSite schema
- 600-700 word SEO content on every page, 1500+ words on solver
- E-E-A-T signals added (author, about sections, honest limitations)
- Human writing skill applied (conversational tone, specific details, no AI-speak)
- Site deployed and live

---
Task ID: analytics-parity-2026-05-20
Agent: Main Agent
Task: Fix historical comparison math and align the analysis site more closely with saved nytbee pages

Work Log:
- Inspected the production D1 schema through the live worker setup.
- Confirmed production tables:
  - `puzzles(puzzle_id, date, letters, all_letters, word_count, pangrams_count, date_iso, total_points)`
  - `words(id, puzzle_id, word, length, is_pangram)`
- Confirmed production counts on May 20, 2026:
  - `2933` puzzles
  - `121957` stored answer rows
- Identified the main frontend root cause for wrong percentiles:
  - `src/pages/today.astro` was using min/max interpolation instead of full-history percentile math.
  - It also hardcoded fallback score/date values for highest and lowest score.
  - Its score and word-count bars were scaled by bucket label, not by the number of puzzles in each bucket.
- Verified correct historical values directly from D1 for the May 19, 2026 puzzle:
  - score `299`
  - word count `62`
  - highest score `537` on January 22, 2021
  - lowest score `47` on March 27, 2023
  - last prior score at least `299` was May 10, 2026
  - last prior puzzle with more than `62` answers was May 16, 2026
  - genius minimum word length was `7`
  - last prior puzzle with the same genius minimum length was May 18, 2026
- Verified the right genius-length formula:
  - group available points by word length
  - accumulate points from shortest lengths upward
  - the first length whose cumulative points reaches Genius is the required length
- Found major historical data-quality problems in the production archive:
  - the raw archive contained impossible score outliers above the real historical max
  - examples included inflated puzzles such as February 23, 2025 with a computed score of `764`
  - this came from the stored word rows themselves, not just the cached puzzle totals
- Added an archive-cleaning rule for score-based history:
  - compute `pointsPerWord = score / word_count`
  - compute mean and standard deviation across all puzzles
  - exclude puzzles above `mean + 3 * stddev` from score-based history
  - current threshold on May 20, 2026: `7.5032`
  - excluded score outliers: `46`
- Added worker-side historical analytics so the frontend stops inventing history:
  - new in-memory analytics cache
  - score histogram
  - word-count histogram
  - genius-length histogram
  - average-word-length histogram
  - pangram history lookup
  - common-word counts
  - all-answer and unique-answer length distributions
- Worker files changed:
  - `spellingbee-worker-updated-one/src/index.js`
- Worker API changes:
  - added `GET /api/puzzleAnalysis/:id`
  - added `GET /api/pangramHistory/:word`
  - fixed `GET /api/mostCommonCenterLetters` so percentages divide by all puzzles, not just the limited returned subset
  - updated `GET /api/statistics` to expose cleaned `highestScore` and `lowestScore`
- Frontend files changed:
  - `src/pages/today.astro`
  - `src/pages/archive.astro`
  - `src/pages/index.astro`
  - `src/pages/stats.astro`
- Rewrote `src/pages/today.astro` to use the worker analysis payload instead of rough local math.
- Added nytbee-style sections/order improvements to the today page:
  - hidden "Show Official Answers"
  - puzzle statistics / Genius explanation
  - words by first letter
  - other days with this pangram
  - score percentile section
  - word-count percentile section
  - genius-length section
  - average-word-length section
  - historical letter charts
  - common-word list
  - all-answer and unique-answer length distributions
  - server-rendered non-official dictionary words from `public/twl06.txt`
- Removed the broken client-side dependency on a nonexistent `/api/nonOfficialWords/:id` route.
- Removed the old client-side pangram-history loading spinners from the today page by rendering pangram history server-side.
- Added archive deep links:
  - `archive?date=<month-day-year>` now loads the requested puzzle directly
  - today sidebar links, stats extreme links, and home recent-puzzle links now point to exact archive dates
- Verified successful frontend builds after installing dependencies.
- Important environment note:
  - this checkout needed `npm install --legacy-peer-deps`
  - reason: `@astrojs/svelte@8.1.1` expects Astro 6, while this project is still on Astro 5
- Deployment completed:
  - worker deployed to `https://spelling-bee-api.sbsolver.workers.dev`
  - Pages deployed to the `spellingbee-solver` Cloudflare Pages project
  - verified `https://spellingbeesolver.dev/today/` now shows the new historical sections and cleaned score extremes

Important Formulas / Decisions:
- Word-count percentile:
  - empirical rank = `count(puzzles with lower word_count) / total_puzzles`
- Score percentile:
  - empirical rank = `count(clean score-history puzzles with lower score) / total_clean_score_puzzles`
  - score history uses the outlier-cleaned archive, not the raw archive
- Genius threshold:
  - `round(total_points * 0.70)`
- Minimum word length for Genius:
  - shortest maximum word length whose cumulative available points reaches Genius
- Non-official words:
  - words from `public/twl06.txt`
  - must be at least 4 letters
  - must contain the center letter
  - must use only the 7 valid puzzle letters
  - must not already be in the official answer set for that puzzle

Remaining Known Gap:
- The historical corpus in our database still does not exactly match the saved `nytbee` archive totals.
- Current worker analytics on May 20, 2026:
  - all stored answer rows: `121957`
  - unique stored words: `16817`
- Saved `nytbee` May 19, 2026 page shows:
  - accepted answers ever: `118001`
  - unique words: `10990`
- This strongly suggests older historical rows in our archive were imported from broader SBSolver-style answer sets instead of the exact official NYT answer corpus.
- Because of that, these sections may still differ from `nytbee` until the historical archive itself is cleaned or re-ingested from an official source:
  - common-word counts
  - all-time answer totals
  - unique-word totals
  - some whole-history percentiles
- Specific known example:
  - for the May 19, 2026 puzzle, our cleaned archive computes a score percentile of `92`
  - the saved `nytbee` HTML text says `93`
  - word-count percentile, highest/lowest score dates, last-score date, last-more-answers date, and genius-length history all now match the saved page

Next Best Follow-Up:
- Rebuild the historical archive from the official NYT answer source for every past date, or identify a reliable official historical feed.
- Once the archive corpus is fully official, recompute:
  - common-word counts
  - all answer-length totals
  - unique-word totals
  - score and word-count percentiles for exact nytbee parity

---
Task ID: parity-kv-archive-definitions-2026-05-21
Agent: Main Agent
Task: Push the analytics closer to nytbee parity, add KV caching, archive parity improvements, GitHub rebuild automation, and definition storage/generation plumbing

Work Log:
- Confirmed the live root cause for broken pangram history:
  - older archive rows used uppercase words
  - newer rows use lowercase
  - the historical pangram map was case-sensitive
  - result: `BACKBOARD`, `BACKDOOR`, and `CORKBOARD` incorrectly showed "No earlier puzzles found"
- Confirmed the archive also contained duplicate `(puzzle_id, lower(word))` rows from older imports.
- Added normalized and deduped historical analytics in the worker:
  - all historical words now normalize to lowercase
  - duplicate puzzle-word rows are ignored in analytics
  - pangram history now keys on normalized words
- Changed puzzle analysis to be date-scoped:
  - archive pages now compare a puzzle against history available up to that puzzle's date
  - this matches saved historical nytbee pages much more closely than comparing against the full future archive
- Added KV-backed cached per-puzzle analysis:
  - created KV namespace binding `ANALYTICS_CACHE`
  - worker cache key versioning now controls analytics invalidation
  - D1 table `kv_cache_budget` was added lazily by the worker to track daily cache writes
- Added lazy D1 support tables through the worker:
  - `word_definitions`
  - `kv_cache_budget`
- Added worker definition helpers:
  - fetch definitions for puzzle words
  - upsert generated definitions
  - list missing definitions for a puzzle
- Added new worker routes:
  - `GET /api/definitions/:word`
  - `GET /api/admin/definitions/missing/puzzle/:id`
  - `POST /api/admin/definitions/upsert`
- Updated existing worker routes:
  - `/today` and `/api/puzzle/:id` now include `definitionsByWord`
  - `/api/wordLengthDistribution` now uses deduped analytics instead of raw duplicated rows
  - `/api/statistics` now uses deduped totals and the correct 537-point historical max again
  - `BASE_URL` switched to `https://spellingbeesolver.dev`
- Removed the old score-outlier suppression from live analytics after verifying deduped D1 scores directly:
  - `January 22, 2021` really is `537`
  - after deduping, the top score list is sane without the heuristic filter
- Confirmed from D1 that the deduped top score list begins:
  - `537` on `January 22, 2021`
  - `506` on `September 24, 2023`
  - `496` on `June 5, 2022`
- Switched the worker's "today" filter to site timezone `Asia/Kolkata`:
  - this aligns latest-puzzle behavior with the requested midnight IST rollout
- Updated Cloudflare cron schedule in `wrangler.toml`:
  - `30 18 * * *`
  - `35 18 * * *`
  - `45 18 * * *`
  - those are `12:00am`, `12:05am`, and `12:15am` IST
- Created the Cloudflare KV namespace and wired it into `wrangler.toml`:
  - binding: `ANALYTICS_CACHE`
  - id: `e6864ed6da3349ac9433374e6b372ca2`
- Added a GitHub Actions rebuild pipeline:
  - file: `.github/workflows/daily-rebuild.yml`
  - triggers:
    - `workflow_dispatch`
    - `repository_dispatch` with event type `spellingbee-refresh`
  - pipeline:
    - install deps
    - backfill missing definitions via NVIDIA NIM
    - build Astro site
    - deploy to Cloudflare Pages
- Added worker-side GitHub repository_dispatch trigger:
  - scheduled scrape now pings GitHub after storing the latest puzzle
  - manual `/api/update/nyt` also pings GitHub
- Added definition generation/backfill script:
  - `scripts/backfill-definitions.mjs`
  - fetches missing words for a puzzle
  - calls NVIDIA NIM
  - upserts deduped word definitions into D1
- Added parity audit script:
  - `scripts/audit-nytbee-parity.mjs`
  - compares our worker analytics to live `nytbee.com/Bee_YYYYMMDD.html`
  - used to check two sets of 10 dates
- Updated the frontend today page:
  - added a `Show Word Meanings` section powered by `definitionsByWord`
  - replaced the broken per-word pangram-history display with a combined earlier-puzzles section
  - today page now shows live earlier pangram dates again
- Updated the archive page:
  - archive detail view now fetches `puzzleAnalysis`
  - added archive-side comparison sections with histogram bars
  - added archive-side word meanings section
  - added archive-side pangram-history section
  - archive detail is now much closer to the today-page analysis experience
- Added `PROJECT_STRUCTURE.txt` to explain:
  - current active frontend
  - active worker
  - scripts
  - workflow
  - legacy nested frontend
  - nytbee reference folder
  - other loose reference artifacts

Deployments Completed:
- Worker deployed multiple times to:
  - `https://spelling-bee-api.sbsolver.workers.dev`
- Pages deployed multiple times to the Cloudflare Pages project:
  - `spellingbee-solver`
  - latest successful direct-upload preview during this pass:
    - `https://92367cce.spellingbee-solver.pages.dev`

Important Cloudflare / GitHub Secret Placement:
- Add these as Cloudflare Worker secrets or plain env vars for the worker:
  - `APIKEY`
  - `GITHUB_TOKEN`
  - `GITHUB_REPO_URL`
- Add these as GitHub repository secrets for the workflow:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `WORKER_ADMIN_API_KEY`
  - `NVIDIA_NIM_API_KEY`
- The NVIDIA key belongs in GitHub Actions, not in the worker, because the workflow is what calls NIM.
- The GitHub PAT belongs in Cloudflare Worker secrets, because the worker is what triggers `repository_dispatch`.

## 2026-05-21 GitHub Repo URL Config
- Replaced the split `GITHUB_REPO_OWNER` + `GITHUB_REPO_NAME` setup with a simpler `GITHUB_REPO_URL` flow for local Cloudflare secret sync and worker GitHub API calls.
- The worker now accepts either `https://github.com/owner/repo` or `owner/repo`, normalizes it internally, and still falls back to the old owner/name env vars for backward compatibility.
- `scripts/sync-worker-secrets.ps1` now validates and normalizes `GITHUB_REPO_URL` before uploading secrets to Cloudflare, so the same value works locally and in production.
- `cloudflare.local.env.example` now documents the simpler repo URL setup and recommends a fine-grained GitHub token with repository-scoped `Contents` write access.

Audit Results After Fixes:
- The worker/page stack now matches live nytbee exactly for many recent dates that previously failed, including:
  - `2026-05-19`
  - `2026-05-18`
  - `2026-05-16`
  - `2026-05-13`
  - `2026-05-11`
  - `2026-05-10`
  - `2026-05-08`
  - `2026-05-06`
  - `2026-05-05`
  - `2026-05-04`
  - `2026-05-02`
- Remaining recent mismatches after the final sweep are small and data-corpus-driven, not large frontend math failures:
  - score percentile off by `1` on a few dates such as:
    - `2026-05-20`
    - `2026-05-15`
    - `2026-05-12`
    - `2026-05-07`
    - `2026-05-01`
  - one pangram-history date remains extra for `2026-05-17`
  - one word-count percentile off-by-one remains on `2026-05-14`
- The remaining drift is consistent with the broader historical corpus issue already identified earlier:
  - our archive still contains some historical answer/pangram data that differs slightly from the exact `nytbee` corpus
  - fixing those last mismatches requires historical data cleanup/re-ingestion, not more frontend hardcoding

Final State of the Big Questions:
- Pangram history bug:
  - fixed for the original current-page failure case
  - current live today page now shows earlier pangram dates again
- Highest/lowest score dates:
  - fixed live and no longer hardcoded
- Archive detail analysis parity:
  - substantially improved and now uses the same worker analysis source
- Daily rebuild flow:
  - added
- NVIDIA definition architecture:
  - added
- KV + D1 optimization path:
  - added

Next Best Follow-Up:
- Rebuild the historical archive from the exact official NYT answer corpus to remove the last off-by-one percentile and extra pangram-history differences.
- Once that corpus cleanup is done, re-run:
  - `node scripts/audit-nytbee-parity.mjs --recent 10`
  - `node scripts/audit-nytbee-parity.mjs --recent 10 --offset 10`

## 2026-05-21 Solver Fix
- Root cause: \\public/twl06.txt\\ is served with CRLF line endings, and the client solver was splitting only on \\\\n\\, leaving a hidden \\\\r\\ on every word. That made every candidate fail the letter-set validation loop and caused the UI to always show 'No words found for these letters'.
- Fix: normalized dictionary loading in \\src/pages/solver.astro\\ with \\.split(/\\r?\\n/)\\ and \\.trim()\\, and changed dictionary-load failures to surface an explicit error message instead of silently solving against an empty list.
- Verification: local build now returns real solver results for the live today letters instead of zero matches.


## 2026-05-21 Archive + Redirect Cleanup
- Hid the word-meanings section entirely on /today and /archive when no definitions exist. The old fallback text about backfilling definitions is removed from the UI.
- Removed Yesterday from the main header/mobile nav and footer answer links because the route is now just a redirect target.
- Added public/_redirects with /yesterday -> /archive and changed src/pages/yesterday.astro to a minimal window.location.replace('/archive') fallback, so the redirect is fast on Pages and still works in static previews.
- Extended the archive detail renderer to include the major analysis sections that were missing compared with /today: word-length bars, points-by-length bars, letter-history charts, common-word history, full answer-length history, and non-official dictionary words for the selected archive puzzle.
- Added local Cloudflare admin scripts:
  - scripts/sync-worker-secrets.ps1 reads cloudflare.local.env and uploads Worker secrets with Wrangler.
  - scripts/purge-analysis-cache.ps1 deletes KV analysis cache keys by prefix.
- Added cloudflare.local.env.example and ignored the real local secret file in .gitignore.
- Bumped ANALYSIS_CACHE_VERSION to 8 so stale cached archive analytics are ignored after deploy.

- Removed the last stray Yesterday's Answers CTA from the /today sidebar so /yesterday no longer appears in the active UI.

## 2026-05-23 Today Page + Release Timing Fixes
- Root cause for the site looking "one day late" was not the database. The worker cron was still running at 12:00am IST, 12:05am IST, and 12:15am IST, but the NYT Spelling Bee puzzle does not release until 12:30pm IST. That meant the rebuild pipeline was repeatedly fetching and publishing the previous day's puzzle.
- Updated the worker cron schedule to:
  - 12:31pm IST
  - 01:31pm IST backup
- Added duplicate-date checks before storing a puzzle in:
  - scheduled worker runs
  - `POST /api/update/nyt`
  - `GET /api/update/nyt`
- Important behavior change:
  - GitHub `repository_dispatch` is now sent only when a brand-new puzzle is stored.
  - This removes the old behavior where every cron run could trigger another rebuild even when the puzzle had not changed yet.
- Improved the worker root API documentation at `/` with browser-friendly admin auth examples using `?key=YOUR_API_KEY`.
- Added build-time API cache-busting to the Astro frontend for server-rendered pages so a new rebuild fetches fresh worker data instead of baking a stale 5-minute cached API response into the static HTML.
- Updated `/today` SEO copy and visible headings:
  - removed the `Today` and `Full Analysis` badges
  - H1 now uses `Spelling Bee Answer today with Clue and Meaning (DATE)`
  - matching title/description metadata now use the same phrasing
  - the official answers `<details>` label now reads `Show today's official spelling bee answers`
  - the meanings `<details>` label now reads `Show spelling bee answers with means`
- Confirmed the answers/meanings sections on `/today` are semantic `<details>/<summary>` content, not JS-only content, so the text remains present in the HTML source for indexing.
- Improved the definitions pipeline:
  - `scripts/backfill-definitions.mjs` now reads the local `human-writing/SKILL.md` guidance and includes it in the NIM prompt
  - definitions are now requested as richer multi-sentence English explanations
  - usage notes are now asked to include at least one natural example sentence
  - smaller generation batches and retry logic were added because the earlier long-output NIM calls were timing out
  - added `--force` mode so existing word definitions can be regenerated, not just missing ones
- Updated the `/today` and archive definition cards to render the richer `usageNotes` block as `Example and usage`.

## 2026-05-23 Snapshot Build + Archive Permalinks
- Reworked the public site architecture so the browser no longer depends on the worker for normal page rendering.
- Added `scripts/generate-site-data.mjs` and wired `npm run build` to:
  - fetch authenticated worker data
  - generate `public/site-data/*.json`
  - generate per-puzzle `public/site-data/archive/*.json`
  - generate pre-rendered archive detail HTML under `public/site-data/archive-html/`
  - run the Astro static build after the snapshot is ready
- Added `src/lib/site-data.js` to read build snapshots from disk during Astro generation.
- Added `src/lib/render-puzzle-detail.js` to render archive puzzle detail pages from a saved bundle instead of rebuilding the view client-side in the browser.
- Converted these pages away from live worker fetches and onto snapshot files:
  - `src/pages/index.astro`
  - `src/pages/today.astro`
  - `src/pages/stats.astro`
  - `src/pages/solver.astro`
- Replaced the old archive query-string detail flow with permanent static pages:
  - new archive index: `src/pages/archive.astro`
  - new per-puzzle route: `src/pages/archive/[slug].astro`
  - canonical public path is now `/archive/<month>-<day>-<year>/`
- The archive root page now:
  - lists all puzzles from the snapshot
  - uses a date picker that maps directly to the permanent archive URL
  - upgrades old `?date=` URLs client-side to the new canonical path
- The old `404` recovery for `/answer-for-*` now redirects directly to `/archive/<slug>/`.
- Added a Pages redirect rule for `/answer-for/:slug -> /archive/:slug/` in `public/_redirects`.
- Added site-level SEO files generated from the snapshot:
  - `src/pages/robots.txt.ts`
  - `src/pages/sitemap.xml.ts`
- Domain/canonical output remains `https://spellingbeesolver.dev`.
- Tightened worker exposure further:
  - only `/` remains public on the worker
  - data routes require API key auth
  - the public site now does not need those data endpoints at runtime
- Removed the old worker path that committed `public/today.json` into GitHub on update. The active publishing path is now repository_dispatch -> GitHub Action rebuild from snapshots.
- Verification completed:
  - `npm run build` succeeded with `2,944` static pages built
  - built HTML no longer contains worker API URLs for `index`, `today`, `stats`, `solver`, `archive`, or archive detail pages
  - Playwright verification confirmed:
    - `/today` renders fully with zero worker data requests
    - `/solver` autofill uses the snapshot letters and only fetches `/twl06.txt`
    - archive detail pages render full answer/analysis HTML at build time

