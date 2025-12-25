# Complete Vercel Setup Guide for PDFPro

**Step-by-step instructions to deploy PDFPro from your Vercel dashboard**

---

## 📋 Prerequisites Checklist

Before you start, have these ready:
- [ ] Vercel account (sign up at vercel.com)
- [ ] GitHub repository with your PDFPro code (or local folder ready)
- [ ] Google Cloud account for OAuth setup
- [ ] Google AI Studio account for Gemini API

---

## Part 1: Google OAuth Setup (One-Time Setup)

This is done ONCE by you (the app owner). Users will just click "Sign in with Google" - they don't need to do anything!

### Step 1.1: Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click dropdown at top → **New Project**
3. Project name: "PDFPro" (or your choice)
4. Click **Create**
5. Wait 30 seconds for project creation

### Step 1.2: Enable Google+ API

1. In your new project, click **☰** menu → **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it → Click **Enable**
4. Wait for it to enable (takes a few seconds)

### Step 1.3: Create OAuth Consent Screen

1. **☰** menu → **APIs & Services** → **OAuth consent screen**
2. Select **External** (for any Google user to sign in)
3. Click **Create**

**Fill in the form:**
- App name: `PDFPro`
- User support email: Your email
- App logo: (optional - upload if you have one)
- App domain:
  - Homepage: `https://your-app.vercel.app` (you'll update this later)
  - Privacy policy: `https://your-app.vercel.app/privacy-policy.html`
  - Terms of service: `https://your-app.vercel.app/terms-and-conditions.html`
- Developer contact email: Your email

4. Click **Save and Continue**
5. **Scopes**: Click **Add or Remove Scopes**
   - Check: `.../auth/userinfo.email`
   - Check: `.../auth/userinfo.profile`
   - Check: `openid`
6. Click **Update** → **Save and Continue**
7. **Test users**: Skip (or add yourself for testing)
8. Click **Save and Continue** → **Back to Dashboard**

### Step 1.4: Create OAuth Credentials

1. **☰** menu → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: "PDFPro Web Client"
5. **Authorized JavaScript origins**:
   - Add: `https://your-project-name.vercel.app`
   - Add: `http://localhost:5173` (for development)
6. **Authorized redirect URIs**:
   - Add: `https://your-project-name.vercel.app/api/auth/google/callback`
   - Add: `http://localhost:5173/api/auth/google/callback`
7. Click **Create**

**✅ SAVE THESE - YOU'LL NEED THEM:**
- **Client ID**: Something like `123456789-abc.apps.googleusercontent.com`
- **Client Secret**: Something like `GOCSPX-abc123xyz`

Click **OK** to close the popup (you can always see them again from Credentials page)

---

## Part 2: Get Gemini API Key

### Step 2.1: Create API Key

1. Go to https://makersuite.google.com/app/apikey
2. Click **Create API Key**
3. Select your Google Cloud project (the one you just made) OR create new one
4. Click **Create**

**✅ SAVE THIS:**
- **API Key**: Something like `AIzaSyABC123...xyz`

---

## Part 3: Deploy to Vercel

### Step 3.1: Import Project to Vercel

**Method A: From GitHub (Recommended)**

1. Push your code to GitHub (if not already):
   ```bash
   git add .
   git commit -m "Initial PDFPro commit"
   git push origin main
   ```

2. Go to https://vercel.com/dashboard
3. Click **Add New...** → **Project**
4. Find your GitHub repository → Click **Import**

**Method B: From Local Folder**

1. Go to https://vercel.com/dashboard
2. Click **Add New...** → **Project**
3. Click **Browse** → Select your `pdfpro` folder
4. Click **Upload**

### Step 3.2: Configure Project Settings

On the import screen:

**Framework Preset**: Vite (should auto-detect)

**Root Directory**: `./` (leave default)

**Build and Output Settings**:
- Build Command: `npm run build` (auto-filled)
- Output Directory: `dist` (auto-filled)
- Install Command: `npm install` (auto-filled)

### Step 3.3: Don't Deploy Yet - Click "Environment Variables" First!

**IMPORTANT**: Don't click Deploy yet! We need to add environment variables first.

---

## Part 4: Set Up Vercel Postgres Database

### Step 4.1: Create Database

1. While still on the Vercel project page (or go to your project dashboard)
2. Click **Storage** tab at the top
3. Click **Create Database**
4. Select **Postgres**
5. Database name: `pdfpro-db` (or leave default)
6. Region: Choose closest to your users (e.g., US East)
7. Click **Create**
8. Wait 1-2 minutes for provisioning ☕

### Step 4.2: Automatic Environment Variables

**Good news!** Vercel automatically adds these to your project:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

You don't need to copy these manually!

### Step 4.3: Run Database Migrations

1. Click your database name → Click **Query** tab
2. Copy the ENTIRE contents of `migrations/001_initial_schema.sql` from your project
3. Paste into the query box
4. Click **Run Query**
5. You should see: "CREATE TABLE" messages for all 6 tables ✅

**Verify tables were created:**
- Run this query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
- You should see: users, files, note_groups, note_items, tasks, canvas_layers

---

## Part 5: Set Up Vercel Blob Storage

### Step 5.1: Create Blob Store

1. Still in **Storage** tab
2. Click **Create Database** again
3. Select **Blob**
4. Store name: `pdfpro-files` (or leave default)
5. Click **Create**
6. Wait 30 seconds

### Step 5.2: Automatic Environment Variable

Vercel automatically adds:
- `BLOB_READ_WRITE_TOKEN`

You're done! File uploads will work now.

---

## Part 6: Add Your Environment Variables

### Step 6.1: Go to Environment Variables

1. In your Vercel project dashboard
2. Click **Settings** tab
3. Click **Environment Variables** in left menu

### Step 6.2: Add These Variables One by One

Click **Add** for each:

**1. GOOGLE_CLIENT_ID**
- Key: `GOOGLE_CLIENT_ID`
- Value: (paste the Client ID from Step 1.4)
- Environment: Check all three (Production, Preview, Development)
- Click **Save**

**2. GOOGLE_CLIENT_SECRET**
- Key: `GOOGLE_CLIENT_SECRET`
- Value: (paste the Client Secret from Step 1.4)
- Environment: Check all three
- Click **Save**

**3. GEMINI_API_KEY**
- Key: `GEMINI_API_KEY`
- Value: (paste the API key from Step 2.1)
- Environment: Check all three
- Click **Save**

**4. JWT_SECRET**
- Key: `JWT_SECRET`
- Value: Generate a random string (see below)
- Environment: Check all three
- Click **Save**

**How to generate JWT_SECRET:**
- On Mac/Linux terminal: `openssl rand -hex 32`
- Or use this: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Or just type a random 32+ character string

**OPTIONAL: LIBRE_OFFICE_SERVICE_URL**
- Only add this if you deploy the converter microservice
- Leave empty for now (PDF operations will still work without conversions)

---

## Part 7: Deploy Your Application

### Step 7.1: Trigger Deployment

Now you can deploy!

**If you haven't deployed yet:**
- Go back to your project overview
- Click **Deploy**

**If already deployed (but before adding env vars):**
- Click **Deployments** tab
- Click **...** on latest deployment → **Redeploy**
- Check "Use existing Build Cache" off
- Click **Redeploy**

### Step 7.2: Wait for Deployment

- Takes 1-3 minutes
- You'll see build logs
- When done, you'll see "✅ Deployment Completed"

### Step 7.3: Get Your Live URL

Your app is now live at:
`https://your-project-name.vercel.app`

**Copy this URL!** You need it for next step.

---

## Part 8: Update Google OAuth Redirect URIs

### Step 8.1: Update OAuth Settings

1. Go back to https://console.cloud.google.com/
2. **☰** → **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized JavaScript origins**:
   - **Remove** the temporary URL if you added one
   - **Add**: `https://your-actual-vercel-url.vercel.app`
5. Under **Authorized redirect URIs**:
   - **Remove** the temporary URL
   - **Add**: `https://your-actual-vercel-url.vercel.app/api/auth/google/callback`
6. Click **Save**

---

## Part 9: Update OAuth Consent Screen URLs

### Step 9.1: Final OAuth Configuration

1. Still in Google Cloud Console
2. **☰** → **APIs & Services** → **OAuth consent screen**
3. Click **Edit App**
4. Update these URLs with your real Vercel URL:
   - App homepage: `https://your-actual-vercel-url.vercel.app`
   - Privacy policy: `https://your-actual-vercel-url.vercel.app/privacy-policy.html`
   - Terms: `https://your-actual-vercel-url.vercel.app/terms-and-conditions.html`
5. Click **Save and Continue** through all pages

---

## Part 10: Test Your Application

### Step 10.1: Test OAuth Sign-In

1. Open your Vercel URL in a private/incognito browser window
2. Click "Sign in with Google"
3. Select your Google account
4. Grant permissions
5. You should be redirected back and logged in! ✅

### Step 10.2: Test Email Sign-Up

1. Click "Sign up with Email"
2. Enter email, password, name
3. Click Register
4. You should be logged in! ✅

### Step 10.3: Test File Upload

1. Click upload button
2. Select a file
3. File should upload and appear in list ✅

---

## Part 11: Custom Domain (Optional)

### Step 11.1: Add Custom Domain

1. In Vercel dashboard → Your project
2. Click **Settings** → **Domains**
3. Enter your domain (e.g., `pdfpro.pro`)
4. Click **Add**
5. Follow DNS setup instructions
6. Wait for DNS propagation (5 mins - 48 hours)

### Step 11.2: Update OAuth URLs Again

Once domain is active, update Google OAuth one more time with your custom domain!

---

## 🎉 You're Done!

Your PDFPro application is now:
- ✅ Deployed on Vercel
- ✅ Connected to Postgres database
- ✅ Connected to Blob storage
- ✅ OAuth authentication working
- ✅ Email authentication working
- ✅ Legal pages accessible

---

## 📞 Troubleshooting

### OAuth Not Working

**Issue**: Clicking "Sign in with Google" does nothing

**Fix:**
1. Check browser console for errors (F12 → Console)
2. Verify `GOOGLE_CLIENT_ID` is correct in Vercel env vars
3. Verify redirect URI exactly matches in Google Cloud Console
4. Try in incognito mode
5. Make sure popups aren't blocked

### Database Errors

**Issue**: "Database connection failed"

**Fix:**
1. Go to Vercel → Storage → Your Database
2. Make sure status is "Active"
3. Go to Query tab → Run `SELECT 1;` to test connection
4. If migrations didn't run, run the SQL from Step 4.3 again

### File Upload Fails

**Issue**: "Failed to upload file"

**Fix:**
1. Check `BLOB_READ_WRITE_TOKEN` is present in env vars
2. Go to Storage → Your Blob store → Make sure it's active
3. Check file size (must be under 100MB)
4. Check browser console for specific error

### 500 Internal Server Error

**Fix:**
1. Check Vercel dashboard → Your project → **Functions** tab
2. Click on the failing function → View logs
3. Look for error messages
4. Common issues:
   - Missing environment variable
   - Syntax error in code
   - Database connection issue

---

## 🔄 Updating Your App

When you make code changes:

1. Commit to GitHub:
   ```bash
   git add .
   git commit -m "Your changes"
   git push
   ```

2. Vercel auto-deploys! (if connected to GitHub)

OR manually:
```bash
vercel --prod
```

---

## 📚 Useful Vercel Dashboard Links

- **Deployments**: See all deployment history
- **Functions**: View API logs and errors
- **Storage**: Manage Postgres and Blob
- **Settings** → **Environment Variables**: Update keys
- **Analytics**: See usage and performance
- **Logs**: Real-time application logs

---

## 🆘 Need Help?

1. Check [Vercel Documentation](https://vercel.com/docs)
2. Check [Google OAuth Docs](https://developers.google.com/identity/protocols/oauth2)
3. View function logs in Vercel dashboard for specific errors
4. Check browser console (F12) for frontend errors

---

**Congratulations!** 🎊 Your production-ready PDFPro application is live!
