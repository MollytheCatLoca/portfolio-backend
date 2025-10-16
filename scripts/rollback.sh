#!/bin/bash

##############################################################################
# Rollback Script
#
# Rolls back the VPS deployment to a previous commit
#
# Usage:
#   ./scripts/rollback.sh [commit-hash]
#
# If no commit hash provided, rolls back to HEAD~1 (previous commit)
#
# Exit codes:
#   0 - Rollback successful
#   1 - Rollback failed
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="root@82.29.58.172"
VPS_PATH="/root/portfolio-backend"

# Get target commit (default to HEAD~1)
TARGET_COMMIT="${1:-HEAD~1}"

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║       Portfolio Backend - Rollback Script            ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Get current commit
CURRENT_COMMIT=$(ssh $VPS_HOST "cd $VPS_PATH && git rev-parse HEAD")
echo -e "${BLUE}Current commit:${NC} ${CURRENT_COMMIT:0:7}"

# Resolve target commit
RESOLVED_TARGET=$(ssh $VPS_HOST "cd $VPS_PATH && git rev-parse $TARGET_COMMIT")
echo -e "${BLUE}Target commit:${NC}  ${RESOLVED_TARGET:0:7}"
echo ""

# Confirm rollback
read -p "$(echo -e ${YELLOW}Proceed with rollback? \(y/n\): ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Rollback cancelled${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}[1/5]${NC} Rolling back git to ${RESOLVED_TARGET:0:7}..."

ssh $VPS_HOST << ENDSSH
set -e
cd $VPS_PATH

# Reset to target commit
git reset --hard $RESOLVED_TARGET

echo "   ✅ Git reset complete"

ENDSSH

echo -e "${GREEN}✅ Git rollback complete${NC}"
echo ""

#=============================================================================
# Rebuild and Restart
#=============================================================================

echo -e "${YELLOW}[2/5]${NC} Installing dependencies..."
ssh $VPS_HOST "cd $VPS_PATH && npm install --production=false --silent"
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}[3/5]${NC} Generating Prisma Client..."
ssh $VPS_HOST "cd $VPS_PATH && npx prisma generate > /dev/null"
echo -e "${GREEN}✅ Prisma Client generated${NC}"
echo ""

echo -e "${YELLOW}[4/5]${NC} Building TypeScript..."
ssh $VPS_HOST "cd $VPS_PATH && npm run build"
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

echo -e "${YELLOW}[5/5]${NC} Restarting application..."
ssh $VPS_HOST "cd $VPS_PATH && pm2 restart portfolio-backend"
sleep 5

# Verify application is running
if ssh $VPS_HOST "curl -s http://localhost:3001/api/health | jq -e '.success == true'" > /dev/null; then
  echo -e "${GREEN}✅ Application restarted successfully${NC}"
else
  echo -e "${RED}❌ Application failed to start${NC}"
  exit 1
fi

echo ""

#=============================================================================
# Post-Rollback Verification
#=============================================================================

echo -e "${YELLOW}Running post-rollback health checks...${NC}"

# Check database
if ssh $VPS_HOST "curl -s http://localhost:3001/api/health/db | jq -e '.data.connected == true'" > /dev/null; then
  echo -e "   ✅ Database connection OK"
else
  echo -e "${RED}   ❌ Database connection failed${NC}"
  exit 1
fi

# Check PM2 status
PM2_STATUS=$(ssh $VPS_HOST "pm2 jlist" | jq -r '.[0].pm2_env.status')
if [ "$PM2_STATUS" == "online" ]; then
  echo -e "   ✅ PM2 status: ${GREEN}online${NC}"
else
  echo -e "${RED}   ❌ PM2 status: $PM2_STATUS${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            ✅ ROLLBACK SUCCESSFUL ✅                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Rolled back from: ${CURRENT_COMMIT:0:7}"
echo -e "  Current commit:   ${RESOLVED_TARGET:0:7}"
echo -e "  Status:           ${GREEN}ONLINE${NC}"
echo ""
echo -e "${BLUE}📊 Next steps:${NC}"
echo -e "  View logs:       ${YELLOW}ssh $VPS_HOST 'pm2 logs portfolio-backend'${NC}"
echo -e "  Run tests:       ${YELLOW}./scripts/test-vps.sh${NC}"
echo -e "  Monitor:         ${YELLOW}ssh $VPS_HOST 'pm2 monit'${NC}"
echo ""

# Save PM2 state
ssh $VPS_HOST "cd $VPS_PATH && pm2 save" > /dev/null 2>&1

echo -e "${GREEN}✅ Rollback completed successfully!${NC}"
echo ""
