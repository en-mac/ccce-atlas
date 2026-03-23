# Required GitHub Secrets for Deployment

This document lists all GitHub Secrets required for automated deployment to AWS EC2.

## Setup Instructions

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each secret below

## Required Secrets

### SSH Configuration

| Secret Name | Description | Example |
|------------|-------------|---------|
| `EC2_SSH_KEY` | Private SSH key for EC2 access | Contents of your `.pem` file |
| `EC2_HOST` | EC2 instance public IP or hostname | `54.123.45.67` or `atlas.ccce.dev` |
| `EC2_USER` | SSH username for EC2 | `ec2-user` or `ubuntu` |

### Application Configuration

| Secret Name | Description | Example |
|------------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |

## How Secrets Are Used

During deployment, GitHub Actions:
1. Uses `EC2_SSH_KEY` to authenticate to EC2
2. Pushes code via rsync to `EC2_USER@EC2_HOST`
3. Creates `.env.production` file from `DATABASE_URL` and `REDIS_URL` secrets
4. Runs deployment script to build and start services

## Security Notes

- Never commit secrets to git (they're in `.gitignore`)
- Rotate `EC2_SSH_KEY` if compromised
- Use strong passwords for `DB_PASSWORD`
- Limit EC2 security group to allow SSH only from GitHub Actions IPs (optional)
- Consider using AWS Secrets Manager or Parameter Store for enhanced security

## Verifying Secrets

To check if all required secrets are configured:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Verify all secrets listed above are present
3. Trigger a manual deployment: **Actions** → **Deploy to AWS EC2** → **Run workflow**

## Troubleshooting

**Deployment fails with "Permission denied (publickey)":**
- Check that `EC2_SSH_KEY` contains the correct private key
- Verify `EC2_HOST` and `EC2_USER` are correct

**Deployment fails with ".env.production not found":**
- Ensure all DB and Redis secrets are configured
- Check workflow logs to see if `.env.production` creation failed

**Database connection errors:**
- Verify `DATABASE_URL` is correct (format: `postgresql://user:pass@host:5432/dbname`)
- Ensure EC2 security group allows connection to database
- Check RDS security group allows inbound from EC2
