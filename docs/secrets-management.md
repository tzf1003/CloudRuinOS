# Secrets Management Guide

This document describes how to manage secrets for the RMM system across different environments.

## Overview

The RMM system uses Cloudflare Workers secrets to store sensitive configuration data. Secrets are environment-specific and are managed through the Wrangler CLI.

## Required Secrets

### Core Secrets

| Secret Name | Description | Usage |
|-------------|-------------|-------|
| `ENROLLMENT_SECRET` | Used to generate and validate enrollment tokens | Device registration |
| `JWT_SECRET` | Used for JWT token signing and verification | Authentication |
| `WEBHOOK_SECRET` | Used to verify webhook payloads | External integrations |
| `DB_ENCRYPTION_KEY` | Used to encrypt sensitive data in database | Data protection |
| `ADMIN_API_KEY` | Used for administrative API operations | Management operations |

### Environment-Specific Configuration

Each environment (development, test, production) has its own set of secrets to ensure isolation and security.

## Setup Instructions

### Prerequisites

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

### Automated Setup

Use the provided scripts to set up secrets automatically:

#### Linux/macOS
```bash
# Make script executable
chmod +x scripts/setup-secrets.sh

# Set up secrets for production
./scripts/setup-secrets.sh setup production

# Set up secrets for test environment
./scripts/setup-secrets.sh setup test
```

#### Windows
```cmd
# Set up secrets for production
scripts\setup-secrets.bat setup production

# Set up secrets for test environment
scripts\setup-secrets.bat setup test
```

### Manual Setup

If you prefer to set up secrets manually:

```bash
cd server

# Generate a random secret (example)
SECRET_VALUE=$(openssl rand -base64 32)

# Set the secret for production environment
echo "$SECRET_VALUE" | wrangler secret put ENROLLMENT_SECRET --env production

# Repeat for other secrets and environments
```

## Secret Management Operations

### List Current Secrets

```bash
# List secrets for production
./scripts/setup-secrets.sh list production

# List secrets for test
./scripts/setup-secrets.sh list test
```

### Rotate Secrets

For security best practices, rotate secrets periodically:

```bash
# Rotate all secrets for production
./scripts/setup-secrets.sh rotate production
```

**Important**: After rotating secrets, update any external systems that depend on them.

### Delete a Secret

```bash
# Delete a specific secret
./scripts/setup-secrets.sh delete production OLD_SECRET_NAME
```

### Backup Secrets

Create a backup before major changes:

```bash
# Create backup for production secrets
./scripts/setup-secrets.sh backup production
```

**Warning**: Backup files contain sensitive information. Store them securely and delete after copying to a safe location.

## Environment Configuration

### Development Environment

- Uses local secrets for development
- Secrets can be stored in `.env.local` file (not committed to git)
- Use `wrangler dev` with `--local` flag for local development

### Test Environment

- Isolated secrets for testing
- Automatically deployed via GitHub Actions
- Uses separate Cloudflare resources (D1, KV, R2)

### Production Environment

- Production-grade secrets with high entropy
- Deployed only from `main` branch
- Requires manual approval for deployment
- Monitored for unauthorized access

## Security Best Practices

### Secret Generation

- Use cryptographically secure random generators
- Minimum 32 characters length
- Include uppercase, lowercase, numbers, and special characters
- Never reuse secrets across environments

### Secret Storage

- Never commit secrets to version control
- Use Cloudflare's secure secret storage
- Limit access to secrets on a need-to-know basis
- Regularly audit secret access logs

### Secret Rotation

- Rotate secrets every 90 days minimum
- Rotate immediately if compromise is suspected
- Use gradual rollout for secret rotation
- Maintain rollback capability during rotation

### Access Control

- Use separate Cloudflare accounts for different environments
- Implement least-privilege access
- Use API tokens with minimal required permissions
- Enable audit logging for all secret operations

## Troubleshooting

### Common Issues

1. **Secret not found error**
   - Verify secret exists: `wrangler secret list --env <environment>`
   - Check environment name spelling
   - Ensure you're in the correct directory (`server/`)

2. **Permission denied**
   - Verify Cloudflare login: `wrangler whoami`
   - Check API token permissions
   - Ensure account access to the Worker

3. **Secret value empty**
   - Check secret generation process
   - Verify no trailing whitespace in secret value
   - Use proper encoding for special characters

### Recovery Procedures

1. **Lost secrets**
   - Use backup files if available
   - Regenerate secrets using setup script
   - Update dependent systems with new secrets

2. **Compromised secrets**
   - Immediately rotate all affected secrets
   - Review access logs for unauthorized usage
   - Update monitoring alerts
   - Notify security team

## GitHub Actions Integration

Secrets are automatically managed in CI/CD pipelines:

### Required GitHub Secrets

Add these secrets to your GitHub repository settings:

| GitHub Secret | Description |
|---------------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for deployments |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `TEST_API_BASE_URL` | Base URL for test environment |
| `PROD_API_BASE_URL` | Base URL for production environment |

### Deployment Process

1. Secrets are set during deployment
2. Health checks verify secret availability
3. Rollback procedures handle secret failures
4. Notifications sent for secret-related issues

## Monitoring and Alerting

### Secret Usage Monitoring

- Monitor secret access patterns
- Alert on unusual access attempts
- Track secret rotation schedules
- Log all secret management operations

### Health Checks

- Verify secret availability during deployment
- Test secret functionality in health checks
- Monitor application errors related to secrets
- Automated rollback on secret failures

## Compliance and Auditing

### Audit Requirements

- Log all secret management operations
- Maintain secret rotation history
- Document access control changes
- Regular security reviews

### Compliance Standards

- Follow SOC 2 Type II requirements
- Implement PCI DSS controls where applicable
- Maintain GDPR compliance for EU data
- Document security procedures

## Support and Escalation

For secret-related issues:

1. Check this documentation first
2. Review troubleshooting section
3. Check GitHub Actions logs
4. Contact DevOps team for assistance
5. Escalate to security team for compromises