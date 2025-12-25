# PDFPro Deployment Guide

Complete step-by-step guide to deploy PDFPro to production on Vercel.

## Prerequisites

- Vercel account
- Google Cloud Platform account (for OAuth)
- Google AI Studio account (for Gemini API)
- GitHub repository (optional but recommended)

## Step 1: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen:
   - Application name: "PDFPro"
   - User support email: your email
   - Developer contact: your email
6. Create OAuth client:
   - Application type: **Web application**
   - Name: "PDFPro Production"
   - Authorized JavaScript origins:
     - `https://your-domain.vercel.app`
     - `http://localhost:5173` (for development)
   - Authorized redirect URIs:
     - `https://your-domain.vercel.app/api/auth/google/callback`
     - `http://localhost:5173/api/auth/google/callback`
7. Save the **Client ID** and **Client Secret**

## Step 2: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click **Create API Key**
3. Save the API key

## Step 3: Deploy to Vercel

### Option A: Deploy via GitHub (Recommended)

1. Push your code to GitHub repository
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click **Add New** → **Project**
4. Import your GitHub repository
5. Configure project settings:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

## Step 4: Set Up Vercel Postgres

1. In your Vercel project, go to **Storage** tab
2. Click **Create Database** → **Postgres**
3. Choose a region close to your users
4. Wait for database to be provisioned (takes 1-2 minutes)
5. Vercel will automatically add these environment variables:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - And several others

## Step 5: Run Database Migrations

1. Install Vercel CLI if not already: `npm install -g vercel`
2. Link your project: `vercel link`
3. Pull environment variables: `vercel env pull .env.local`
4. Run migrations:

```bash
# Connect to your Vercel Postgres database
npx vercel env pull

# Run the migration SQL
# Option 1: Using Vercel Postgres dashboard
# - Go to Vercel Dashboard → Your Project → Storage → Postgres
# - Click "Query" tab
# - Copy contents of migrations/001_initial_schema.sql
# - Paste and execute

# Option 2: Using psql (if you have it installed)
psql $POSTGRES_URL < migrations/001_initial_schema.sql
```

## Step 6: Set Up Vercel Blob

1. In your Vercel project, go to **Storage** tab
2. Click **Create Database** → **Blob**
3. Vercel will automatically add `BLOB_READ_WRITE_TOKEN` to environment variables

## Step 7: Configure Environment Variables

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add the following variables:

```env
GOOGLE_CLIENT_ID=<your_google_client_id>
GOOGLE_CLIENT_SECRET=<your_google_client_secret>
JWT_SECRET=<generate_secure_random_string>
GEMINI_API_KEY=<your_gemini_api_key>
LIBRE_OFFICE_SERVICE_URL=<optional_converter_url>
```

To generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Make sure to set variables for all environments:
   - Production
   - Preview
   - Development (if needed)

## Step 8: Update Google OAuth Redirect URIs

1. Go back to Google Cloud Console
2. Update your OAuth client redirect URIs with your actual Vercel URL:
   - `https://your-actual-domain.vercel.app/api/auth/google/callback`

## Step 9: Deploy and Test

1. Trigger a new deployment:
   ```bash
   git push origin main
   # Or via Vercel CLI
   vercel --prod
   ```

2. Wait for deployment to complete

3. Test the following:
   - ✅ Landing page loads
   - ✅ Google OAuth sign-in works
   - ✅ User dashboard loads after auth
   - ✅ File upload works
   - ✅ Notes CRUD operations work
   - ✅ PDF operations work (if files are PDFs)

## Step 10: Optional - LibreOffice Converter Microservice

For PDF to Office format conversions, deploy a separate microservice:

### Deploy to Railway

1. Create a new GitHub repository: `pdfpro-converter`
2. Copy the converter code from planning.md Section 4
3. Push to GitHub
4. Go to [Railway](https://railway.app/)
5. Create new project from GitHub repo
6. Railway will auto-detect Dockerfile and deploy
7. Copy the deployment URL
8. Add to Vercel: `LIBRE_OFFICE_SERVICE_URL=https://your-app.railway.app`

### Deploy to Render

1. Same repository as above
2. Go to [Render](https://render.com/)
3. Create new **Web Service**
4. Connect GitHub repository
5. Environment: **Docker**
6. Deploy
7. Copy the deployment URL
8. Add to Vercel environment variables

## Troubleshooting

### OAuth Not Working

- Check redirect URIs match exactly (including trailing slashes)
- Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
- Check browser console for errors
- Ensure popups are not blocked

### Database Connection Issues

- Verify all POSTGRES_* environment variables are set
- Check that migrations were run successfully
- Try using the Vercel Postgres dashboard query tool

### File Upload Failing

- Check BLOB_READ_WRITE_TOKEN is set
- Verify file size is under 100MB
- Check browser console for errors

### API Routes Returning 500

- Check Vercel Function Logs in dashboard
- Verify all environment variables are set correctly
- Check that JWT_SECRET is at least 32 characters

### CORS Issues

- Ensure your frontend is accessing APIs on the same domain
- Check that API routes are under `/api/` directory

## Production Checklist

Before going live:

- [ ] All environment variables set in Vercel
- [ ] Database migrations completed
- [ ] Google OAuth configured with production URLs
- [ ] File upload/download tested
- [ ] Notes and tasks persistence verified
- [ ] PDF operations working
- [ ] Error monitoring set up (optional: Sentry)
- [ ] Analytics configured (optional: Vercel Analytics)
- [ ] Custom domain configured (optional)
- [ ] HTTPS enabled (automatic with Vercel)

## Monitoring

### Vercel Dashboard

- Monitor deployment status
- Check function logs for errors
- View analytics and performance metrics

### Error Logging

Consider adding:
- [Sentry](https://sentry.io/) for error tracking
- [LogRocket](https://logrocket.com/) for session replay
- Vercel built-in logging

## Scaling Considerations

### Database

- Vercel Postgres auto-scales
- Consider connection pooling for high traffic
- Monitor query performance in dashboard

### Blob Storage

- Vercel Blob has generous limits
- Charges based on storage and bandwidth
- Monitor usage in dashboard

### Serverless Functions

- Default: 10 second timeout
- Increase for long operations
- Consider background jobs for heavy processing

## Support

For issues:
1. Check Vercel Function Logs
2. Review browser console errors
3. Verify environment variables
4. Test API endpoints directly

---

**Deployment complete!** Your production PDFPro application is now live. 🚀
