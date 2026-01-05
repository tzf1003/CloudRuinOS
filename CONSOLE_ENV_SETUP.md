# Console Environment Variables Setup Guide

This document describes the environment variables required for ruinos-console deployment.

## Required Environment Variables

### 1. VITE_API_BASE_URL (Required)

**Purpose**: API server base URL for the console to communicate with the backend

**Examples**:
- Production: `https://ruinos-server.your-account.workers.dev`
- Custom domain: `https://api.yourdomain.com`
- Local development: `http://localhost:8787`

**Where to set**:
- **GitHub Actions**: Add `RUINOS_SERVER_URL` to GitHub repository secrets
- **Local development**: Set in `.env.local` file
- **Cloudflare Pages**: Set in environment variables (see below)

### 2. VITE_DEV_MODE (Optional)

**Purpose**: Enable development-specific features

**Values**: `true` or `false`

**Default**: Automatically set based on build mode

### 3. VITE_REFRESH_INTERVAL (Optional)

**Purpose**: Data refresh interval in milliseconds

**Default**: `30000` (30 seconds)

**Example**: `60000` for 1-minute refresh

## Setup Instructions

### Option 1: GitHub Actions Deployment (Recommended)

1. **Get your Cloudflare Workers URL**:
   ```bash
   cd server
   npx wrangler deployments list
   # Copy your workers.dev URL
   ```

2. **Add to GitHub Secrets**:
   - Go to your repository settings
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `RUINOS_SERVER_URL`
   - Value: Your Cloudflare Workers URL (e.g., `https://ruinos-server.your-account.workers.dev`)

3. **Deploy**: Push to main branch or run workflow manually

### Option 2: Manual Cloudflare Pages Deployment

1. **Build locally**:
   ```bash
   cd console
   VITE_API_BASE_URL=https://your-server-url.workers.dev npm run build
   ```

2. **Deploy to Cloudflare Pages**:
   ```bash
   npx wrangler pages deploy dist --project-name=ruinos-console
   ```

3. **Set environment variables in Cloudflare Pages**:
   - Go to Cloudflare Dashboard → Pages → ruinos-console
   - Navigate to **Settings** → **Environment variables**
   - Add for **Production**:
     - Variable name: `VITE_API_BASE_URL`
     - Value: Your Workers URL

### Option 3: Local Development

1. **Create `.env.local` file** in `console/` directory:
   ```env
   # API Configuration
   VITE_API_BASE_URL=http://localhost:8787
   
   # Optional: Development settings
   VITE_DEV_MODE=true
   VITE_REFRESH_INTERVAL=30000
   ```

2. **Start development server**:
   ```bash
   cd console
   npm run dev
   ```

## Environment Variable Precedence

Variables are loaded in this order (highest to lowest priority):

1. Build-time environment variables (e.g., `VITE_API_BASE_URL=... npm run build`)
2. `.env.local` file (local development only, not committed)
3. `.env` file (committed, contains production values)
4. `.env.development` file (development defaults)
5. `.env.example` file (template only)

## Verification

After deployment, verify the API URL is correctly set:

1. **Open browser console** on your deployed console page
2. **Check the API requests** in the Network tab
3. **Verify requests** are going to your Workers URL

## Troubleshooting

### Console can't connect to API

**Problem**: 404 or network errors when accessing the console

**Solutions**:
1. Verify `VITE_API_BASE_URL` is set correctly
2. Check your Workers deployment is live:
   ```bash
   curl https://your-server-url.workers.dev/health
   ```
3. Ensure CORS is enabled on your Workers (it should be by default)

### Hard-coded URL in build

**Problem**: Console is using old/wrong API URL

**Solutions**:
1. Clear build artifacts: `rm -rf console/dist`
2. Rebuild with correct env var:
   ```bash
   VITE_API_BASE_URL=https://new-url.workers.dev npm run -w console build
   ```

### GitHub Actions using wrong URL

**Problem**: Deployed console points to wrong API

**Solutions**:
1. Check GitHub Secrets has `RUINOS_SERVER_URL` set correctly
2. Re-run the deployment workflow
3. Clear Cloudflare Pages cache (Deployments → Retry)

## Required GitHub Secrets Summary

Add these secrets to your GitHub repository:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for deployments | `abc123...` (from Cloudflare dashboard) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | `def456...` (from Cloudflare dashboard) |
| `RUINOS_SERVER_URL` | Your deployed Workers API URL | `https://ruinos-server.xxx.workers.dev` |

## Security Notes

- ⚠️ Environment variables starting with `VITE_` are **exposed** in the client-side bundle
- ✅ Only include **public** information like API URLs
- ❌ **Never** include secrets, API keys, or passwords in console env vars
- ✅ All sensitive secrets should be in the server-side (Cloudflare Workers secrets)

## Next Steps

After configuring environment variables:

1. Deploy console: Push to main branch
2. Access at: `https://ruinos-console.pages.dev`
3. Login with your `ADMIN_PASSWORD` (set during server secrets setup)

For server secrets setup, see: [SECRETS_SETUP.md](SECRETS_SETUP.md)
