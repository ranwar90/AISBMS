# AIS Middle Grades - Boys · Behaviour Management System — Netlify deployment

Al-Rowad International Schools · 100-point weekly retention system, 4C Skills Recognition, reports, hallway display.

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | The app (teacher dashboard, admin, reports, hallway display). |
| `public/db-adapter.js` | Connects the app to the database API below. |
| `netlify/functions/db.mjs` | The database API (`/api/db`), stored in **Netlify Blobs** (built into Netlify, no extra account). |
| `data/seed-data.json` | Your data exported from the claude.ai version on 29 Sep 2026: 237 students, 49 staff, all points, notes and 4C skills recognitions, and your Settings (conduct categories, skills, severity thresholds). Loaded automatically the **first time** the site runs. Keep a copy as a backup. |
| `netlify.toml`, `package.json` | Netlify build settings. |

## Already have your-site.netlify.app from Netlify Drop?

A Drop deploy can't run the database, so it has never stored any data. Deploy this folder over the same site
with either method below (for the command line, use `npx netlify-cli link` and pick **your existing site** instead of `init`).
Your data from `data/seed-data.json` loads automatically the first time the new version runs.

If a *working* deploy (GitHub or command line) has already been used, its live data is kept: the seed file is
only ever loaded into an empty store, so redeploying never overwrites records.

## Deploy (about 10 minutes)

You need a free Netlify account and Node.js (LTS) installed on your computer.
**Drag-and-drop (Netlify Drop) will not work**, because the database function has to be built.

1. Unzip this folder, open a terminal in it, and run:
   ```
   npm install
   npx netlify-cli login
   npx netlify-cli init            (choose "Create & configure a new site")
   ```
2. **Set the access key** (required: the database refuses every request until this is set). Pick a long passphrase:
   ```
   npx netlify-cli env:set ACCESS_KEY "choose-a-long-passphrase-here"
   ```
3. Deploy:
   ```
   npx netlify-cli deploy --build --prod
   ```
4. Open the site URL it prints. The first visit asks for the access key, then shows the normal login.

**Alternative (GitHub):** push this folder to a GitHub repo → Netlify → Add new site → Import from Git
(leave build command empty; publish directory `public` is read from `netlify.toml`) → Site configuration →
Environment variables → add `ACCESS_KEY` → Deploys → Trigger deploy.

If you change `ACCESS_KEY` later, redeploy for it to take effect.

## Signing in

- Staff: school email + E-number (as before). Staff enter the **access key** once per device; it's remembered.
- Built-in logins (in the page source): admin `admin2627` / `2627`, test teacher `testteacher2627` / `2627`.
  Change them before going live: in `public/index.html`, search for `MASTER_ADMIN_PASSWORD` and `MASTER_TEACHER_PASSWORD`.

## Security — please read

- The access key keeps the student data behind a shared secret. Without it, the API returns nothing.
- It is a **shared** key, not individual accounts. Staff logins (email + E-number) record who logged what,
  but anyone who has the access key can technically read all records through the API, including staff E-numbers.
  Share the key only with staff, and change it (step 2 + redeploy) if it leaks.
- The built-in admin/test logins are visible to anyone who views the page source. Change or remove them.
- For stronger protection, Netlify's paid plans offer site-wide password protection, which can be added on top.

## How syncing works

- Your own changes save instantly. Other teachers' changes appear within ~15 seconds, or immediately when you
  switch back to the tab. The hallway display refreshes the same way.
- Simultaneous saves by different teachers are merged safely (tested with 40 at once: none lost).

## Important: the claude.ai version is separate

This deployment starts from the data exported on 29 Sep 2026. Anything logged on the old claude.ai link after
that will **not** appear here, and the two never sync. Once this site is live, move everyone to the new URL and
stop using the old link.

## Backups

- `data/seed-data.json` is the starting snapshot.
- For ongoing backups, an admin can download the **Excel report** (Reports → ⬇ Download Excel report) weekly.
- Live data is in Netlify Blobs, store `g8-discipline-tracker` (visible in the Netlify dashboard under Blobs).

## Usage limits

Each open device checks for updates every 15 s while visible (paused when the tab is hidden). This counts
towards Netlify's function usage. A normal school day should sit comfortably within the free tier for a
grade-level team, but if you put the hallway display on several screens all day or add many more staff,
keep an eye on Usage in the Netlify dashboard.
