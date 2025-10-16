#!/bin/bash

##############################################################################
# Stop Script for Portfolio Backend (Run on VPS)
#
# This script stops the portfolio-backend service on the VPS
#
# Usage:
#   ./scripts/stop.sh
##############################################################################

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════╗"
echo "║     Portfolio Backend - Stop Script                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  echo -e "${RED}❌ PM2 is not installed${NC}"
  exit 1
fi

echo -e "${YELLOW}Stopping portfolio-backend...${NC}"
pm2 stop portfolio-backend || echo "Process not running"

echo ""
echo -e "${GREEN}✅ Portfolio Backend stopped${NC}"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "To start again:"
echo "  pm2 start portfolio-backend"
echo "  or"
echo "  ./scripts/start.sh"
