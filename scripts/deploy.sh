#!/bin/bash

##############################################################################
# Deploy Script for Portfolio Backend
#
# This script deploys the portfolio-backend to the VPS
#
# Usage:
#   ./scripts/deploy.sh
#
# What it does:
#   1. Commits and pushes local changes to GitHub
#   2. SSHs into VPS
#   3. Pulls latest code from GitHub
#   4. Installs dependencies
#   5. Builds TypeScript
#   6. Restarts PM2 process
##############################################################################

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════╗"
echo "║     Portfolio Backend - Deploy Script               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Configuration
VPS_HOST="root@82.29.58.172"
VPS_PATH="/root/portfolio-backend"
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Local Git Operations
echo -e "${YELLOW}[1/6]${NC} Committing and pushing local changes..."

git add .
read -p "Enter commit message: " COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
  echo -e "${RED}❌ Commit message cannot be empty${NC}"
  exit 1
fi

git commit -m "$COMMIT_MSG" || echo "No changes to commit"
git push origin $BRANCH

echo -e "${GREEN}✅ Local changes pushed to GitHub${NC}"
echo ""

# Step 2: SSH to VPS and deploy
echo -e "${YELLOW}[2/6]${NC} Connecting to VPS..."

ssh $VPS_HOST << 'ENDSSH'

set -e

echo "🔍 Current directory: $(pwd)"
cd /root/portfolio-backend

echo ""
echo "⏬ Pulling latest code from GitHub..."
git pull origin main

echo ""
echo "📦 Installing dependencies..."
npm install --production=false

echo ""
echo "🏗️  Building TypeScript..."
npm run build

echo ""
echo "🔄 Restarting PM2 process..."
pm2 restart portfolio-backend || pm2 start ecosystem.config.js

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 PM2 Status:"
pm2 status

ENDSSH

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""
echo "Useful commands:"
echo "  ssh $VPS_HOST 'pm2 logs portfolio-backend'"
echo "  ssh $VPS_HOST 'pm2 monit'"
echo "  ssh $VPS_HOST 'curl http://localhost:3001/health'"
