# route-board
A service-visit tracker for water treatment field work. One HTML file,
Supabase database, hosted free on Vercel. Total setup: about 15–20 minutes,
all doable from a phone.

You'll create three free accounts: **Supabase** (database), **GitHub**
(holds the code), **Vercel** (hosts the app).

---

## Step 1 — Supabase (the database)

1. Go to **supabase.com** → Sign up (Continue with GitHub is easiest —
   create the GitHub account first if you don't have one, see Step 3).
2. **New project** → give it a name like `route-board`, set a database
   password (save it somewhere), pick the region closest to you → Create.
3. Wait a minute for it to spin up.
4. In the left menu open **SQL Editor** → **New query** → paste the entire
   contents of `setup.sql` from this folder → tap **Run**.
   You should see "Success. No rows returned."
5. In the left menu open **Project Settings → API** (or Data API). Copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key** (a long string of letters)
   Keep these handy for Step 3. (The anon key is safe to put in the app —
   the database rules you just ran mean it only unlocks each user's own data.)

## Step 2 — GitHub (holds the code)

1. Go to **github.com** → Sign up.
2. Tap **+** → **New repository** → name it `route-board` → Public → Create.
3. Tap **Add file → Create new file** (on mobile, use the desktop-site view
   in Safari if you don't see it, or use the github.com web editor).
4. Name the file `index.html`.
5. Open `index.html` from this folder, copy ALL of it, and paste it in.
6. **Before committing:** near the top of the script (search for the word
   `SETUP`) find these two lines:

   ```
   const SUPABASE_URL      = "PASTE_YOUR_PROJECT_URL_HERE";
   const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE";
   ```

   Replace the placeholder text with your Project URL and anon key from
   Step 1 (keep the quote marks).
7. Tap **Commit new file**.

## Step 3 — Vercel (puts it online)

1. Go to **vercel.com** → Sign up → **Continue with GitHub**.
2. **Add New → Project** → Import your `route-board` repository.
3. Don't change any settings → **Deploy**.
4. In about 30 seconds you get a URL like `https://route-board-xyz.vercel.app`.
   That's your app.

## Step 4 — Tell Supabase your app's address

Magic-link sign-in needs to know where to send you back after you tap the
email link:

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel URL (e.g. `https://route-board-xyz.vercel.app`).
3. Save.

## Step 5 — Use it

1. Open your Vercel URL on your phone.
2. Enter your email → **Email me a sign-in link** → open the email → tap the link.
3. You're in, and you stay signed in on that phone.
4. In Safari: **Share → Add to Home Screen** — now it's an app icon.
5. Add your sites. Every change writes straight to the database — the pill
   at the top says **"Synced to database"** when connected.

---

## Later: making changes

Want a new feature? Ask Claude to update `index.html`, then in GitHub open
the file → tap the pencil (edit) → paste the new version → Commit.
Vercel redeploys automatically within a minute.

## Troubleshooting

- **"Setup not finished" warning on the sign-in screen** — the URL/key in
  Step 2.6 weren't pasted, or lost their quote marks. Edit index.html on
  GitHub and fix.
- **Sign-in email never arrives** — check spam. Supabase's built-in email
  sender allows a few per hour, which is plenty for one person.
- **Magic link opens but doesn't sign you in** — Step 4 wasn't done, or the
  Site URL doesn't exactly match your Vercel URL (https, no trailing slash).
- **"Database error" pill** — usually just no signal; it retries when you're
  back online. If it persists, re-run Step 1.4.
