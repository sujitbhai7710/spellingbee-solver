# Spelling Bee Solver — Complete Build Plan

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Astro 6 | Cloudflare-acquired, zero JS default, Islands Architecture |
| **Interactive Components** | Svelte 5 Islands | ~1.5-3KB per component, built-in transitions/animations, compiles to vanilla JS |
| **Styling** | Tailwind CSS 4 | Utility-first, tree-shakes to only used classes |
| **Language** | TypeScript | Type safety for API responses, puzzle data shapes |
| **Deployment** | Cloudflare Pages + Workers | Edge CDN, SSG + SSR, deploy hooks for cron rebuild |
| **Backend API** | Existing Cloudflare Worker (spelling-bee-api) | Already deployed at spelling-bee-api.sbsolver.workers.dev |
| **AI Content** | NVIDIA NIM API (Llama/Qwen) | Generate 1500+ word explanations at build time for /today pages |
| **SEO** | claude-seo skill + E-E-A-T framework | Structured data, human-writing skill, schema markup |
| **Content Voice** | human-writing SKILL.md | Anti-AI patterns, conversational tone, specific details |

---

## API Verification Results

### All Endpoints Verified ✅

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/today` | ✅ Matches NYT exactly | Center=A, Letters=AEHNOPT, 64 words, 3 pangrams for May 16, 2026 |
| `/yesterday` | ✅ Correct | Returns day-before-today puzzle |
| `/api/puzzle/:id` | ✅ Word/pangram counts match | Spot-checked 7 puzzles across ID range |
| `/api/statistics` | ⚠️ Minor avg discrepancy (~1.6%) | `AVG(word_count)`=40.92 vs `COUNT(words)/COUNT(puzzles)`=41.58. Totals correct. Frontend will use actual word arrays, not the avg stat. |
| `/api/puzzles/list` | ✅ Pagination works | Chronological, sorted by date descending |
| `/api/search/date/:query` | ✅ ISO date conversion works | Supports YYYY-MM-DD, YYYY-MM, YYYY formats |
| `/api/search/letter/:letter` | ✅ Works | `centerOnly` param filters correctly |
| `/api/mostCommonCenterLetters` | ✅ 25 letters, sums to puzzle count | O most common (9.1%), Z absent |
| `/api/allLettersFrequency` | ✅ 26 letters, reasonable distribution | A most frequent (1734 puzzles) |
| `/api/longestPangrams` | ✅ Data correct | Longest: NATIONALIZATION (15 letters) |
| `/api/puzzlesWithMostWords` | ✅ Top 10 | Max: 81 words (June 8, 2019) |
| `/api/puzzlesWithMostPangrams` | ✅ Top 10 | Max: 8 pangrams (Dec 16, 2021) |
| `/api/last/:count` | ✅ Works | Returns last N puzzles with words |
| `/sitemap.xml` | ✅ Auto-generated | Static + dynamic routes for last 100 days |
| `/feed.xml` | ✅ RSS feed | Last 20 days |

### Stats Issue Detail
The `/api/statistics` endpoint uses `AVG(word_count)` from the `puzzles` table, which gives 40.92. The actual `COUNT(*)` from the `words` table divided by puzzle count gives 41.58. This ~1.6% discrepancy means a few older puzzles may have been imported with slightly incorrect `word_count` values. **Not blocking** — the frontend calculates totals from actual word arrays, not from the avg stat.

---

## Site Architecture

### Pages & Routes

| Route | Rendering | JS Needed | Data Source |
|-------|-----------|-----------|-------------|
| `/` (Home) | SSG | 0 KB | Build-time fetch of today's puzzle |
| `/today` | SSG (rebuilt daily) | 0 KB (static) + Svelte island for diagram | Build-time fetch + NVIDIA AI content |
| `/solver` | SSG + Svelte Island | ~6 KB (hex grid + input + results) | Client-side: autofill from `/today` API or manual input |
| `/archive` | SSG shell + Svelte Island | ~3 KB (pagination + search) | Client-side: `/api/puzzles/list` with pagination |
| `/stats` | SSG shell + Svelte Island | ~4 KB (Chart.js wrapper + filters) | Client-side: `/api/statistics`, `/api/mostCommonCenterLetters`, `/api/allLettersFrequency`, etc. |
| `/answer-for-{date}` | SSG (rebuilt daily for recent) | 0 KB | Build-time fetch of specific puzzle data + AI content |

### URL Structure (SEO-Optimized)

```
/                           → Home (redirects to /today or shows hero)
/today                      → Today's Spelling Bee Answers
/solver                     → Interactive Spelling Bee Solver
/archive                    → Archive of all puzzles
/stats                      → Spelling Bee Statistics & Insights
/answer-for-may-16-2026     → Answers for specific date (indexable)
/sitemap.xml                → Auto-generated sitemap
/feed.xml                   → RSS feed
/robots.txt                 → Static file
/about                      → About page (E-E-A-T: who we are)
/privacy                    → Privacy policy (E-E-A-T: trust signal)
```

---

## Detailed Page Specifications

### 1. Home Page (`/`)

**Purpose:** Landing page, drives traffic to /today, showcases the solver.

**Layout:**
- Hero section with animated hexagonal letter grid (CSS-only, no JS)
- "Today's Puzzle" card — center letter, all letters, word count, pangrams count
- CTA buttons: "View Today's Answers" → /today, "Use Solver" → /solver
- Quick stats bar: "2,929 puzzles solved | 121,774 words found | 4,114 pangrams discovered"
- Recent 5 puzzles list (linking to /answer-for-{date})

**SEO:**
- Title: "Spelling Bee Solver — Today's NYT Answers, Solver & Archive"
- Meta description: Unique, specific, with numbers
- Schema: WebSite + SearchAction
- H1: "NYT Spelling Bee Solver & Answers"

**Content (using human-writing skill):**
- 300-500 words of intro copy explaining what the site does
- Written conversationally, not corporate

---

### 2. Today Page (`/today`)

**Purpose:** Today's complete Spelling Bee answers with AI-generated explanation.

**Data at Build Time:**
1. Fetch `/today` from Worker API
2. Call NVIDIA NIM API to generate ~1500 words of human-sounding explanation
3. Render everything as static HTML

**Layout:**
- Spelling Bee honeycomb diagram (CSS hexagons, center letter highlighted)
- Date and puzzle info card
- Total Points display with animated progress ring (CSS-only)
- Perfect Pangrams section (if any) — golden highlight
- All Pangrams section
- Words organized by letter count:
  - 9+ letter words
  - 8-letter words
  - 7-letter words
  - 6-letter words
  - 5-letter words
  - 4-letter words
- Each word shows: the word, point value, pangram indicator
- AI-generated explanation section (~1500 words):
  - Analysis of the puzzle's letter combination
  - Difficulty assessment
  - Notable words and their meanings
  - Tips for this specific letter set
  - Written using human-writing skill (conversational, specific, no AI patterns)

**SEO:**
- Title: "Spelling Bee Answers for {Month Day, Year} — {Center Letter} Center | All {N} Words"
- Meta description: "{Month Day, Year} NYT Spelling Bee answers. Center letter {X}, {N} words including {pangram1}, {pangram2}. Total points: {N}."
- Schema: Article + FAQPage (non-Google benefit) + BreadcrumbList
- Canonical URL
- Open Graph image (honeycomb with letters)
- Last modified date

**AI Content Prompt Template (for NVIDIA NIM):**
```
Write a detailed analysis of today's NYT Spelling Bee puzzle for {date}.

Center letter: {centerLetter}
All letters: {allLetters}
Total words: {wordCount}
Pangrams: {pangramList}

Include:
1. An opening paragraph about this specific puzzle (not generic)
2. Analysis of the letter combination and why it's interesting/difficult
3. Discussion of the pangrams found — what they mean, why they're notable
4. Patterns in the word list — common prefixes, suffixes, letter combinations
5. The hardest words to find and why
6. A difficulty rating (1-5) with justification
7. Tips for players struggling with this letter set
8. Fun facts about 2-3 specific words from the list

Rules:
- Write like you're explaining this to a friend over coffee, not writing an encyclopedia entry
- Use specific numbers and examples, not vague statements
- Don't use phrases like "In this article we'll explore" or "Let's dive in"
- Start with the most interesting observation, not a generic intro
- Be opinionated — say which words are cool, which are obscure
- Include at least one personal-sounding observation ("I always forget that...")
- Target: 1500+ words
- Never use: "thrilling", "exciting journey", "leverage", "synergy", "game-changing"
```

---

### 3. Solver Page (`/solver`)

**Purpose:** Interactive Spelling Bee solver tool.

**Two Input Modes:**

**Mode 1: Manual Letter Input**
- 7 text inputs (1 center + 6 outer)
- User types the letters they see in the puzzle
- "Solve" button triggers client-side word lookup

**Mode 2: Hexagon Grid (NYT-style)**
- CSS honeycomb grid with 7 hexagonal cells
- Center cell = center letter (larger, highlighted)
- 6 outer cells arranged around center
- Click a hex to type a letter
- Visual, tactile, feels like the actual puzzle

**Both Modes Share:**
- "Autofill Today's Data" button → fetches `/today` from API → fills in letters automatically
- Submit/Solve button → calls Worker API (client-side) with the letters
- Results display:
  - Total Points
  - All Pangrams (highlighted)
  - Words by letter count (9+, 8, 7, 6, 5, 4 letter)
  - Each word clickable to see definition

**Svelte Island Components:**
1. `HoneycombGrid.svelte` — The hexagonal letter input (~2.5KB)
2. `SolverResults.svelte` — Results display with animations (~2KB)
3. `LetterInput.svelte` — Simple text input alternative (~1KB)

**SEO:**
- Title: "Spelling Bee Solver — Find All Words & Pangrams Instantly"
- Meta description: "Free NYT Spelling Bee solver tool. Enter your 7 letters, find all valid words, pangrams, and total points. Autofill today's puzzle."
- Schema: WebApplication + SoftwareApplication
- H1: "Spelling Bee Solver"

---

### 4. Archive Page (`/archive`)

**Purpose:** Browse all past puzzles chronologically.

**Layout:**
- Search bar (by date or letter)
- Grid/list of puzzles, paginated (20 per page)
- Each puzzle card shows: Date, Center Letter, All Letters, Word Count, Pangrams Count
- Click a card → navigates to `/answer-for-{date}`
- Filter by: center letter, year, month

**Data:** Client-side fetch from `/api/puzzles/list?limit=20&page={n}`

**Svelte Island:**
1. `ArchiveGrid.svelte` — Paginated grid with search/filter (~3KB)

**SEO:**
- Title: "Spelling Bee Archive — All Past Puzzle Answers & Solutions"
- Meta description: "Browse 2,900+ NYT Spelling Bee puzzles. Search by date, center letter, or letter combination. Complete answers for every puzzle."
- Schema: ItemList + BreadcrumbList
- Each puzzle card has its own schema (ListItem)

---

### 5. Stats Page (`/stats`)

**Purpose:** Beautiful, data-rich statistics dashboard.

**Sections:**

**A. Overview Cards**
- Total Puzzles: 2,929
- Total Words: 121,774
- Total Pangrams: 4,114
- Avg Words/Puzzle: 41.58

**B. Most Common Center Letters (Bar Chart)**
- Horizontal bar chart showing frequency of each center letter
- Data: `/api/mostCommonCenterLetters`

**C. Letter Frequency in All Puzzles (Heat Map)**
- 26-cell grid showing how often each letter appears across all puzzles
- Color intensity = frequency
- Data: `/api/allLettersFrequency`

**D. Puzzles With Most Words (Table)**
- Top 10 puzzles ranked by word count
- Data: `/api/puzzlesWithMostWords`

**E. Puzzles With Most Pangrams (Table)**
- Top 10 puzzles ranked by pangram count
- Data: `/api/puzzlesWithMostPangrams`

**F. Longest Pangrams (Table)**
- Top 10 longest pangram words ever
- Data: `/api/longestPangrams`

**G. Historical Trends (Line Chart)**
- Word count over time (x-axis: date, y-axis: word count)
- Data: `/api/last/100` (client-side processed)

**Svelte Island:**
1. `StatsDashboard.svelte` — Orchestrates all chart components
2. `BarChart.svelte` — Reusable bar chart (Chart.js wrapper, ~2KB)
3. `HeatMap.svelte` — Letter frequency grid (~1KB)
4. `DataTable.svelte` — Sortable data table (~1KB)

**SEO:**
- Title: "Spelling Bee Statistics — 2,900+ Puzzles Analyzed | Data & Insights"
- Meta description: "Comprehensive NYT Spelling Bee statistics. Most common center letters, letter frequency, hardest puzzles, longest pangrams. Data from 2,900+ puzzles."
- Schema: Dataset + StatisticalVariable
- Content: 500+ words of analysis written with human-writing skill

---

### 6. Answer Pages (`/answer-for-{date}`)

**Purpose:** Individual page for each day's answers — the main SEO play.

**Layout:** Same as /today but for a specific date.

**Data at Build Time:**
1. For the last 30 days: pre-rendered at build time with AI content
2. For older dates: rendered on-demand (SSR via Cloudflare Worker) or client-side fetch

**SEO (this is the big win):**
- Title: "Spelling Bee Answers for {Month Day, Year} — {Center Letter} Center | {N} Words"
- Unique URL per date = thousands of indexable pages
- Each page has unique AI-generated content = no duplicate content penalty
- Internal links to /today, /solver, /archive, /stats
- Breadcrumb: Home > Archive > {Month Year} > {Date}

---

## Build & Deployment Pipeline

```
Daily Cron (Worker) → Scrape NYT → Store in D1 → Commit today.json to GitHub
                                                       ↓
                                              GitHub Push triggers
                                                       ↓
                                          Cloudflare Pages Deploy Hook
                                                       ↓
                                            Astro Build Process:
                                            1. Fetch /today from API
                                            2. Fetch last 30 days for /answer-* pages
                                            3. Call NVIDIA NIM for AI content
                                            4. Generate static HTML pages
                                            5. Generate sitemap.xml
                                            6. Deploy to 300+ edge locations
```

---

## SEO Strategy (Based on claude-seo E-E-A-T Framework)

### E-E-A-T Signals for This Site

**Experience:**
- "We've analyzed 2,929 Spelling Bee puzzles" — original data, not generic
- Specific puzzle analysis written with first-hand observations
- Screenshots of actual puzzle grids

**Expertise:**
- Author bio on about page: Spelling Bee enthusiast, puzzle solver
- Technical depth in stats (calculating points, perfect pangrams)
- Accurate word definitions and etymology notes

**Authoritativeness:**
- Largest free Spelling Bee answer database (2,900+ puzzles)
- Referenced by puzzle communities
- Consistent daily publication since 2018

**Trustworthiness:**
- Contact information
- Privacy policy
- HTTPS (Cloudflare default)
- Transparent about data source (NYT)
- Date stamps on all pages
- Corrections policy

### Schema Markup Per Page Type

| Page | Schema Types |
|------|-------------|
| Home | WebSite, SearchAction, Organization |
| /today | Article, BreadcrumbList, FAQPage |
| /solver | WebApplication, SoftwareApplication |
| /archive | ItemList, BreadcrumbList |
| /stats | Dataset, StatisticalVariable |
| /answer-for-{date} | Article, BreadcrumbList |
| /about | Organization, Person |
| /privacy | WebPage |

### On-Page SEO Checklist (Every Page)

- [ ] Unique title tag (50-60 chars) with primary keyword
- [ ] Unique meta description (150-160 chars) with specifics
- [ ] H1 matches title intent
- [ ] Image alt text on all images
- [ ] Internal links (3-5 per page)
- [ ] Canonical URL
- [ ] Open Graph tags (title, description, image, type)
- [ ] Twitter Card tags
- [ ] Breadcrumb navigation
- [ ] Last modified date visible
- [ ] No broken links
- [ ] Mobile responsive
- [ ] < 2.5s LCP
- [ ] < 200ms INP
- [ ] < 0.1 CLS

---

## Performance Budget

| Metric | Target | How |
|--------|--------|-----|
| **Total JS (Home)** | 0 KB | Pure SSG, no islands |
| **Total JS (/today)** | 0 KB | Pure SSG (diagram is CSS-only) |
| **Total JS (/solver)** | < 8 KB | 3 Svelte islands |
| **Total JS (/archive)** | < 4 KB | 1 Svelte island |
| **Total JS (/stats)** | < 6 KB | 1 Svelte island with Chart.js |
| **Total CSS** | < 15 KB | Tailwind (tree-shaken) |
| **LCP** | < 1.5s | SSG from Cloudflare edge |
| **INP** | < 100ms | Minimal JS on most pages |
| **CLS** | < 0.05 | Static layouts, font-display:swap |
| **TTFB** | < 50ms | Cloudflare edge cache |
| **Lighthouse** | 95-100 | All categories |

---

## Project Structure

```
spelling-bee-solver/
├── astro.config.mjs          # Astro config with Cloudflare adapter
├── tailwind.config.mjs       # Tailwind 4 config
├── tsconfig.json
├── wrangler.toml             # Cloudflare Pages config
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   ├── og-image.png          # Default OG image
│   └── fonts/                # Self-hosted @fontsource fonts
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro  # Shell: HTML head, nav, footer
│   │   ├── TodayLayout.astro # Extended layout for /today & /answer-*
│   │   └── PageLayout.astro  # Generic page layout
│   ├── pages/
│   │   ├── index.astro       # Home page
│   │   ├── today.astro       # Today's answers
│   │   ├── solver.astro      # Interactive solver
│   │   ├── archive.astro     # Archive browser
│   │   ├── stats.astro       # Statistics dashboard
│   │   ├── about.astro       # About page
│   │   ├── privacy.astro     # Privacy policy
│   │   └── answer-for-[date].astro  # Dynamic answer pages
│   ├── components/
│   │   ├── HexDiagram.astro  # CSS-only honeycomb diagram
│   │   ├── PuzzleCard.astro  # Puzzle info card (static)
│   │   ├── WordList.astro    # Words grouped by length (static)
│   │   ├── PointsRing.astro  # CSS-only progress ring
│   │   ├── Navbar.astro      # Navigation bar
│   │   ├── Footer.astro      # Footer with SEO links
│   │   ├── SEOHead.astro     # Schema + meta tags component
│   │   └── Breadcrumb.astro  # Breadcrumb navigation
│   ├── islands/              # Svelte interactive components
│   │   ├── HoneycombGrid.svelte  # Interactive hex input
│   │   ├── LetterInput.svelte    # Text-based letter input
│   │   ├── SolverResults.svelte  # Results display
│   │   ├── ArchiveGrid.svelte    # Paginated archive browser
│   │   ├── StatsDashboard.svelte # Stats with charts
│   │   ├── BarChart.svelte       # Reusable bar chart
│   │   ├── HeatMap.svelte        # Letter frequency grid
│   │   └── DataTable.svelte      # Sortable data table
│   ├── lib/
│   │   ├── api.ts            # API client functions
│   │   ├── types.ts          # TypeScript interfaces for API data
│   │   ├── ai-content.ts     # NVIDIA NIM API integration
│   │   ├── points.ts         # Point calculation logic
│   │   └── seo.ts            # SEO helper functions
│   ├── content/
│   │   └── about.md          # About page content
│   └── styles/
│       └── global.css        # Tailwind imports + custom CSS
├── skills/                   # SEO & writing skills
│   ├── human-writing/        # Uploaded SKILL.md
│   └── claude-seo/           # Cloned SEO skill repo
└── scripts/
    └── generate-og-images.ts # Generate OG images at build time
```

---

## Color Palette & Design System

### Colors (Honey/Bee Theme)

```
Primary Gold:     #F5A623  (honey gold — CTAs, highlights)
Dark Honey:       #D4890A  (hover states, emphasis)
Center Letter:    #F5A623  (center hex highlight)
Outer Letter:     #E8E8E8  (outer hex cells on light mode)
Background Light: #FAFAF8  (warm off-white)
Background Dark:  #1A1A2E  (deep navy — dark mode)
Card Light:       #FFFFFF
Card Dark:        #16213E
Text Primary:     #1A1A2E
Text Secondary:   #666666
Pangram Gold:     #FFD700  (pangram badge)
Perfect Pangram:  #FF6B35  (perfect pangram — hot orange)
Success Green:    #4CAF50
Error Red:        #EF4444
```

### Typography

```
Headings:   @fontsource/nunito-sans  (friendly, rounded)
Body:       @fontsource/inter        (clean, readable)
Mono:       @fontsource/jetbrains-mono (for word lists)
```

### Design Elements

- Hexagonal shapes (CSS clip-path) throughout
- Glassmorphic cards on dark mode
- Spring-physics animations on solver interactions
- Smooth page transitions via Astro ViewTransitions
- Responsive: mobile-first, hex grid adapts to touch

---

## NVIDIA NIM API Integration

### Build-Time AI Content Generation

During Astro build, for each /today and /answer-for-{date} page:

1. Fetch puzzle data from Worker API
2. Call NVIDIA NIM API (Llama 3.3 70B or Qwen 2.5 72B) with the prompt template
3. Process the AI response through the human-writing skill rules:
   - Remove AI-sounding phrases
   - Add specific details and numbers
   - Ensure conversational tone
   - Check against the self-check questions
4. Save the content as part of the static page

### API Call Structure

```typescript
// src/lib/ai-content.ts
interface PuzzleData {
  date: string;
  centerLetter: string;
  allLetters: string;
  words: Word[];
  pangrams: string[];
  totalPoints: number;
}

async function generatePuzzleAnalysis(puzzle: PuzzleData): Promise<string> {
  // Call NVIDIA NIM API
  // Process with human-writing rules
  // Return ~1500 words of analysis
}
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- [ ] Initialize Astro 6 project with Cloudflare adapter
- [ ] Set up Tailwind CSS 4
- [ ] Create BaseLayout with Navbar, Footer
- [ ] Set up TypeScript types for API data
- [ ] Create API client library (`src/lib/api.ts`)
- [ ] Deploy skeleton to Cloudflare Pages

### Phase 2: Static Pages (Days 3-4)
- [ ] Home page with hero and stats bar
- [ ] Today page with honeycomb diagram and word lists
- [ ] Answer-for-[date] dynamic pages
- [ ] About page (E-E-A-T author bio)
- [ ] Privacy page
- [ ] Implement SEO head component with schema markup
- [ ] Generate sitemap.xml and robots.txt

### Phase 3: Interactive Pages (Days 5-7)
- [ ] Solver page: hex grid Svelte island
- [ ] Solver page: letter input alternative mode
- [ ] Solver page: autofill from API
- [ ] Solver page: results display with animations
- [ ] Archive page: paginated grid with search
- [ ] Stats page: bar charts, heat map, data tables

### Phase 4: AI Content & SEO (Days 8-9)
- [ ] NVIDIA NIM API integration for build-time content
- [ ] Apply human-writing skill to AI content pipeline
- [ ] Apply E-E-A-T framework across all pages
- [ ] Add structured data (schema markup) to all pages
- [ ] Add Open Graph images
- [ ] Internal linking strategy
- [ ] Cross-check SEO against claude-seo quality gates

### Phase 5: Polish & Deploy (Day 10)
- [ ] Dark mode implementation
- [ ] Mobile responsiveness testing
- [ ] Performance audit (Lighthouse 95+)
- [ ] Core Web Vitals verification
- [ ] Deploy hook integration with Worker cron
- [ ] Final production deploy

---

## Key Decisions to Confirm

1. **Domain name**: sbsolver.online is in the Worker's sitemap — is this the final domain?
2. **NVIDIA NIM API key**: Do you have one, or should we use a different AI provider?
3. **Answer page depth**: Should we pre-render the last 30 days, 100 days, or all 2,929 days? (More = more SEO pages but slower builds)
4. **Dark mode**: Should it be default or light-first?
5. **Solver word source**: Should the solver call the existing Worker API, or should we add a new endpoint that accepts arbitrary 7 letters and returns valid words?
6. **GitHub repo for frontend**: Same repo as current (0xSatwik/spellingbee-solver) or a new one?

---

*This plan is ready for your review. Say "all okay" and I'll start coding.*
