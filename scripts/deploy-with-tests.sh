#!/bin/bash

##############################################################################
# Deploy Script with Automated Testing and Rollback
#
# This script deploys portfolio-backend to VPS with:
# - Git synchronization
# - Dependency installation
# - Build process
# - PM2 restart
# - Automated testing (29 tests)
# - Automatic rollback on failure
#
# Usage:
#   ./scripts/deploy-with-tests.sh [commit-message]
#
# Exit codes:
#   0 - Deployment successful
#   1 - Pre-deployment checks failed
#   2 - Deployment failed
#   3 - Tests failed (after rollback)
##############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="root@82.29.58.172"
VPS_PATH="/root/portfolio-backend"
BRANCH="main"
MIN_TESTS_PASSING=28  # Require at least 28/30 tests to pass

# Banner
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Portfolio Backend - Deploy with Testing & Rollback ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ Error: Must run from portfolio-backend root directory${NC}"
  exit 1
fi

# Get commit message
COMMIT_MSG="${1:-Update: automated deployment}"

#=============================================================================
# PHASE 1: Pre-Deployment Checks
#=============================================================================

echo -e "${YELLOW}[1/8]${NC} Running pre-deployment checks..."

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${YELLOW}⚠️  Uncommitted changes detected${NC}"
  echo -e "   Files modified:"
  git status --short
  echo ""
  read -p "Continue with deployment? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment cancelled${NC}"
    exit 1
  fi
fi

# Local build test
echo -e "   Testing local build..."
if ! npm run build > /dev/null 2>&1; then
  echo -e "${RED}❌ Local build failed - fix errors before deploying${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Pre-deployment checks passed${NC}"
echo ""

#=============================================================================
# PHASE 2: Git Operations
#=============================================================================

echo -e "${YELLOW}[2/8]${NC} Committing and pushing to GitHub..."

git add .
if git commit -m "$COMMIT_MSG" 2>&1 | grep -q "nothing to commit"; then
  echo -e "   No changes to commit"
else
  echo -e "   ✅ Changes committed"
fi

git push origin $BRANCH
echo -e "${GREEN}✅ Pushed to GitHub${NC}"
echo ""

#=============================================================================
# PHASE 3: Backup Current State on VPS
#=============================================================================

echo -e "${YELLOW}[3/8]${NC} Creating backup of current deployment..."

BACKUP_COMMIT=$(ssh $VPS_HOST "cd $VPS_PATH && git rev-parse HEAD")
echo -e "   Current commit: ${BACKUP_COMMIT:0:7}"
echo -e "${GREEN}✅ Backup point recorded${NC}"
echo ""

#=============================================================================
# PHASE 4: Deploy to VPS
#=============================================================================

echo -e "${YELLOW}[4/8]${NC} Deploying to VPS..."

ssh $VPS_HOST << 'ENDSSH'
set -e

cd /root/portfolio-backend

echo "   📥 Pulling latest code from GitHub..."
git pull origin main

echo "   📦 Installing dependencies..."
npm install --production=false --silent

echo "   🔧 Generating Prisma Client..."
npx prisma generate > /dev/null

echo "   🏗️  Building TypeScript..."
npm run build

ENDSSH

echo -e "${GREEN}✅ Deployment completed${NC}"
echo ""

#=============================================================================
# PHASE 5: Restart PM2
#=============================================================================

echo -e "${YELLOW}[5/8]${NC} Restarting application..."

ssh $VPS_HOST "cd $VPS_PATH && pm2 restart portfolio-backend"
echo -e "   Waiting for application to start..."
sleep 5

echo -e "${GREEN}✅ Application restarted${NC}"
echo ""

#=============================================================================
# PHASE 6: Health Checks
#=============================================================================

echo -e "${YELLOW}[6/8]${NC} Running health checks..."

# Test API health
if ssh $VPS_HOST "curl -s http://localhost:3001/api/health | jq -e '.success == true'" > /dev/null; then
  echo -e "   ✅ API health check passed"
else
  echo -e "${RED}   ❌ API health check failed${NC}"
  echo -e "${YELLOW}   ⏮️  Initiating rollback...${NC}"
  ./scripts/rollback.sh "$BACKUP_COMMIT"
  exit 2
fi

# Test database connection
if ssh $VPS_HOST "curl -s http://localhost:3001/api/health/db | jq -e '.data.connected == true'" > /dev/null; then
  echo -e "   ✅ Database connection OK"
else
  echo -e "${RED}   ❌ Database connection failed${NC}"
  echo -e "${YELLOW}   ⏮️  Initiating rollback...${NC}"
  ./scripts/rollback.sh "$BACKUP_COMMIT"
  exit 2
fi

echo -e "${GREEN}✅ Health checks passed${NC}"
echo ""

#=============================================================================
# PHASE 7: Run Automated Tests
#=============================================================================

echo -e "${YELLOW}[7/8]${NC} Running automated test suite (29 tests)..."

TEST_OUTPUT=$(ssh $VPS_HOST "cd $VPS_PATH && ./scripts/test-vps.sh 2>&1")
TEST_EXIT_CODE=$?

# Extract test results
TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep -oP 'Passed:\s+\K\d+' || echo "0")
TESTS_FAILED=$(echo "$TEST_OUTPUT" | grep -oP 'Failed:\s+\K\d+' || echo "0")

echo -e "   Tests passed: ${TESTS_PASSED}/30"
echo -e "   Tests failed: ${TESTS_FAILED}"

if [ "$TESTS_PASSED" -ge "$MIN_TESTS_PASSING" ] && [ "$TESTS_FAILED" -eq "0" ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
else
  echo -e "${RED}❌ Tests failed (required: $MIN_TESTS_PASSING passing, 0 failed)${NC}"
  echo ""
  echo -e "${YELLOW}Test output:${NC}"
  echo "$TEST_OUTPUT" | tail -50
  echo ""
  echo -e "${YELLOW}⏮️  Initiating rollback...${NC}"
  ./scripts/rollback.sh "$BACKUP_COMMIT"
  exit 3
fi

echo ""

#=============================================================================
# PHASE 8: Deployment Summary
#=============================================================================

echo -e "${YELLOW}[8/8]${NC} Deployment summary..."

NEW_COMMIT=$(ssh $VPS_HOST "cd $VPS_PATH && git rev-parse HEAD")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           🎉 DEPLOYMENT SUCCESSFUL 🎉                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Previous commit: ${BACKUP_COMMIT:0:7}"
echo -e "  New commit:      ${NEW_COMMIT:0:7}"
echo -e "  Tests passed:    ${TESTS_PASSED}/30"
echo -e "  Status:          ${GREEN}ONLINE${NC}"
echo ""
echo -e "${BLUE}📊 Useful commands:${NC}"
echo -e "  View logs:       ${YELLOW}ssh $VPS_HOST 'pm2 logs portfolio-backend'${NC}"
echo -e "  Monitor:         ${YELLOW}ssh $VPS_HOST 'pm2 monit'${NC}"
echo -e "  PM2 status:      ${YELLOW}ssh $VPS_HOST 'pm2 status'${NC}"
echo -e "  Run tests:       ${YELLOW}./scripts/test-vps.sh${NC}"
echo -e "  Rollback:        ${YELLOW}./scripts/rollback.sh${NC}"
echo ""

# Save deployment info
ssh $VPS_HOST "cd $VPS_PATH && pm2 save" > /dev/null 2>&1

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
