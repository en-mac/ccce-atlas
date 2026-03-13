# CI/CD Setup Instructions

Your GitHub Actions deployment workflow is ready! Follow these steps to complete the setup.

## Overview

When you push to `main`, GitHub Actions will automatically:
1. SSH into your EC2 instance
2. Pull the latest code
3. Rebuild Docker images
4. Restart services
5. Verify the API is healthy

## Setup Steps

### 1. Add GitHub Secrets

Go to your GitHub repository settings and add these secrets:

**Settings → Secrets and variables → Actions → New repository secret**

Add these three secrets:

#### EC2_SSH_KEY
```
# Copy your SSH private key:
cat infra/aws/ccce-atlas-key.pem
```
- Name: `EC2_SSH_KEY`
- Value: Paste the entire contents of the `.pem` file (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`)

#### EC2_HOST
```
3.223.218.50
```
- Name: `EC2_HOST`
- Value: `3.223.218.50`

#### EC2_USER
```
ec2-user
```
- Name: `EC2_USER`
- Value: `ec2-user`

### 2. Ensure .env.production exists on EC2

SSH into your EC2 instance and verify `.env.production` exists:

```bash
ssh -i infra/aws/ccce-atlas-key.pem ec2-user@3.223.218.50

# Check if file exists
cat ~/ccce-atlas/infra/aws/.env.production

# If it doesn't exist, create it with your database credentials
# (You can find these in deployment-info.txt)
```

### 3. Test the Workflow

Commit and push the CI/CD files:

```bash
git add .github/workflows/deploy.yml
git add infra/aws/ci-deploy.sh
git add infra/aws/CICD_SETUP.md
git commit -m "Add CI/CD with GitHub Actions"
git push origin main
```

### 4. Monitor the Deployment

1. Go to your GitHub repository
2. Click the **Actions** tab
3. Watch the "Deploy to AWS EC2" workflow run
4. It should complete in ~2-3 minutes

### 5. Verify It Works

After the workflow completes:

```bash
curl http://3.223.218.50:8000/health
```

You should see: `{"status":"healthy","service":"ccce-atlas-api","environment":"production"}`

## How It Works

```
git push main
    ↓
GitHub Actions triggers
    ↓
Runner connects to EC2 via SSH
    ↓
Runs ci-deploy.sh on EC2
    ↓
Pulls code → Rebuilds images → Restarts containers
    ↓
Verifies API health
    ↓
✅ Deployment complete
```

## Manual Deployment

You can also trigger deployment manually:

1. Go to **Actions** tab in GitHub
2. Select "Deploy to AWS EC2" workflow
3. Click **Run workflow** → **Run workflow**

## Troubleshooting

### Workflow fails with "Permission denied"
- Make sure `EC2_SSH_KEY` secret contains the entire private key
- Verify the key has proper line breaks (not a single line)

### Workflow fails with "connection refused"
- Check EC2 security group allows SSH (port 22) from GitHub IPs
- Verify EC2 instance is running: `aws ec2 describe-instances --instance-ids i-0a0613b23d3b5f91b`

### Deployment succeeds but API is unhealthy
- SSH into EC2 and check logs:
  ```bash
  cd ~/ccce-atlas/infra/aws
  docker-compose -f docker-compose.prod.yml logs
  ```

### .env.production not found
- SSH into EC2 and create it with your database credentials:
  ```bash
  cd ~/ccce-atlas/infra/aws
  nano .env.production
  ```

## Security Notes

- ✅ SSH private key is encrypted in GitHub Secrets (not in code)
- ✅ Database credentials stay in `.env.production` on EC2 (not in repo)
- ✅ No secrets are logged or exposed in GitHub Actions
- ✅ `.pem` file and `deployment-info.txt` are gitignored

## Cost

- GitHub Actions: **Free** (2,000 minutes/month for public repos)
- Each deployment: **~1-2 minutes**
- You can run ~1,000-2,000 deployments per month at no cost

---

**Ready to go!** Just add the GitHub Secrets and push to `main`. 🚀
