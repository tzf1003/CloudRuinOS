# Secrets Setup Quick Start Guide

Before deploying Ruinos Server to Cloudflare Workers, you **MUST** configure the following 6 required secrets.

## Required Secrets

| Secret Name | Purpose | Example Value |
|-------------|---------|---------------|
| `ENROLLMENT_SECRET` | Device enrollment token generation | Auto-generated 64-char hex string |
| `JWT_SECRET` | JWT token signing | Auto-generated 64-char hex string |
| `WEBHOOK_SECRET` | Webhook signature verification | Auto-generated 64-char hex string |
| `DB_ENCRYPTION_KEY` | Database field encryption | Auto-generated 64-char hex string |
| `ADMIN_API_KEY` | API authentication | Auto-generated 64-char hex string |
| `ADMIN_PASSWORD` | Console login password | Your chosen password |

## Quick Setup (Recommended)

### Option 1: Automated Setup Script

```bash
# Make script executable (Unix/Mac)
chmod +x scripts/setup-secrets.sh

# Set up secrets for production
./scripts/setup-secrets.sh setup production

# For Windows, use:
scripts\setup-secrets.bat setup production
```

The script will:
- Auto-generate secure random values for API secrets
- Prompt you to enter ADMIN_PASSWORD
- Set all secrets in Cloudflare Workers

### Option 2: Manual Setup

```bash
cd server

# Generate and set secrets one by one
echo "$(openssl rand -hex 32)" | wrangler secret put ENROLLMENT_SECRET --env production
echo "$(openssl rand -hex 32)" | wrangler secret put JWT_SECRET --env production
echo "$(openssl rand -hex 32)" | wrangler secret put WEBHOOK_SECRET --env production
echo "$(openssl rand -hex 32)" | wrangler secret put DB_ENCRYPTION_KEY --env production
echo "$(openssl rand -hex 32)" | wrangler secret put ADMIN_API_KEY --env production

# Set admin password (you'll be prompted)
wrangler secret put ADMIN_PASSWORD --env production
```

## Verification

After setting secrets, verify they're configured:

```bash
cd server
wrangler secret list --env production
```

You should see all 6 secrets listed (values are hidden for security).

## Important Notes

⚠️ **SAVE YOUR ADMIN_PASSWORD** - You'll need it to access the web console at:
- Production: `https://ruinos-console.pages.dev`

⚠️ **DO NOT COMMIT SECRETS** - Secrets are stored securely in Cloudflare, never in git

⚠️ **BACKUP YOUR SECRETS** - Use the backup command before making changes:
```bash
./scripts/setup-secrets.sh backup production
```

## Troubleshooting

### "wrangler: command not found"
```bash
npm install -g wrangler
```

### "You are not logged in"
```bash
wrangler login
```

### "Secret not found" during deployment
Make sure you:
1. Set secrets in the correct environment (production/test/development)
2. Ran the setup script successfully
3. Are deploying to the same environment

## Next Steps

After configuring secrets:

1. Deploy the server:
   ```bash
   cd server
   npm run deploy
   ```

2. Deploy the console:
   ```bash
   cd console
   npm run deploy
   ```

3. Access the console and login with your ADMIN_PASSWORD

For detailed documentation, see: [docs/secrets-management.md](docs/secrets-management.md)
