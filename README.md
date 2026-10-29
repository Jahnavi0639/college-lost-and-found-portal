# College Lost & Found Portal

A beginner-friendly full-stack college Lost & Found Portal using:

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database & authentication: Supabase

## 1. Required software

- Visual Studio Code
- Node.js LTS
- Git
- A Supabase account
- A GitHub account

## 2. Supabase setup

Create a new Supabase project inside the organisation you want to use.

Open Supabase SQL Editor and run the complete file:

DATABASE/database.sql

Wait for the SQL to finish successfully.

## 3. Supabase credentials

In the Supabase project dashboard, find the API/project settings.

Create `BACKEND/.env` by copying `BACKEND/.env.example`.

Fill in:

```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SECRET_KEY=your_server_side_secret_or_service_role_key
PORT=3000
```

Never put the secret/service-role key in frontend code and never commit `.env` to GitHub.

## 4. Install dependencies

Open a terminal in the BACKEND folder:

```powershell
npm.cmd install
```

## 5. Start the application

From the BACKEND folder:

```powershell
npm.cmd start
```

Open:

http://localhost:3000

## 6. Authentication testing

If Supabase email confirmation is enabled:

1. Create an account once.
2. Check the email inbox and confirm the account.
3. Return to the portal.
4. Log in.

Do not repeatedly click signup/login. Supabase can temporarily rate-limit email authentication.

If signup returns an invalid API key error, stop and check the three `.env` values against the same Supabase project.

## 7. Test checklist

- [ ] Create account
- [ ] Confirm email if required
- [ ] Login
- [ ] Logout
- [ ] Post LOST item
- [ ] Post FOUND item
- [ ] Search
- [ ] Filter LOST/FOUND
- [ ] View own posts
- [ ] Delete own post
- [ ] Submit a claim/report on another user's item

## 8. Common errors

### Invalid API key

Check:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`

Make sure all three come from the same Supabase project. Restart the backend after changing `.env`.

### Email rate exceeded

This is a Supabase authentication rate limit. The application does not automatically retry. Wait before trying again and avoid repeated signup/login clicks.

### Port already in use

Change `PORT=3000` in `.env` to another free port such as `3001`, restart the server, and open the matching localhost URL.

### Tables not found

Run `DATABASE/database.sql` completely in the SQL Editor of the same Supabase project whose URL and keys are in `.env`.
