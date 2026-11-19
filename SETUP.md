# StudyHub v2 — setup guide

This is a static frontend plus Supabase backend. It uses Google OAuth, private per-user study data, a friends-only leaderboard, and a Gemini-powered plan proposal. The AI only proposes changes; the student must approve them.

## 1. Add the database

1. Open your Supabase project: `https://kjuqqrndkgbfhuomracy.supabase.co`.
2. Open **SQL Editor → New query**.
3. Paste all of `supabase/schema.sql` and run it.
4. Confirm that `profiles`, `study_data`, `friend_requests`, and `friendships` appear under **Table Editor**.

## 2. Enable Google sign-in

1. In Supabase, open **Authentication → Providers → Google** and enable Google.
2. In Google Cloud Console, create/configure an OAuth 2.0 Web application client.
3. Add this exact URI to Google's **Authorised redirect URIs**:

   `https://kjuqqrndkgbfhuomracy.supabase.co/auth/v1/callback`

4. Copy the Google Client ID and Client Secret into the Google provider settings in Supabase and save.
5. In Supabase **Authentication → URL Configuration**, set your deployed site URL as Site URL and add your local development URL and deployed URL to Redirect URLs. For example:
   - `http://localhost:5500/**`
   - `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/**`

   Use the real URL where you host StudyHub. Do not leave the example URL as-is.

## 3. Configure Gemini securely

The Gemini key is never placed in `index.html`, `js/config.js`, or any browser file.

1. Install and sign in to the Supabase CLI.
2. From this project folder, link the project:

   ```bash
   supabase login
   supabase link --project-ref kjuqqrndkgbfhuomracy
   ```

3. Set the Gemini secret (replace the placeholder locally; do not commit the key):

   ```bash
   supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```

4. Deploy the Edge Function:

   ```bash
   supabase functions deploy ai-study-manager
   ```

The function checks the signed-in user's access token before calling Gemini. Supabase's project URL and publishable key are the only credentials used in the browser.

## 4. Publish the frontend

Upload `index.html`, the `css` folder, and the `js` folder to your static host, keeping the folder structure unchanged. The supplied `js/config.js` already contains your project's URL and publishable key. Do not replace it with a service-role key.

For local testing, run a static server from this folder, for example:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500` and sign in with Google.

## 5. Friends leaderboard

1. Each account receives a unique friend code when its Supabase auth user is created.
2. Students share codes with people they know and send requests from **Friends ranking**.
3. The recipient accepts the request before either account appears on the other's ranking.
4. The leaderboard is friends-only; it is not a public global list.

## Important notes

- Run the SQL setup before testing sign-in; the profile trigger creates a profile and empty study-data row for each new user.
- If Google sign-in returns a redirect error, check both the Google callback URI and Supabase Redirect URLs.
- If the AI manager says it is not configured, confirm the `GEMINI_API_KEY` secret and redeploy the function.
- Do not share a Supabase `service_role` key or Gemini API key in chat, HTML, JavaScript, or GitHub.
- XP is a motivational, self-reported measure based on saved study minutes and completed targets, not a verified exam score.
- The first release stores the current plan and study log together in each user's private `study_data` JSON record. A later release can migrate logs into dedicated analytics tables if you need richer reporting.
