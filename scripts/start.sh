#!/bin/bash

##############################################################################
# Start Script for Portfolio Backend (Run on VPS)
#
# This script starts the portfolio-backend service on the VPS
#
# Usage:
#   ./scripts/start.sh
#
# What it does:
#   1. Checks if PM2 is installed
#   2. Pulls latest code from GitHub
#   3. Installs dependencies
#   4. Builds TypeScript
#   5. Starts PM2 process
##############################################################################

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════╗"
echo "║     Portfolio Backend - Start Script                ║"
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
  echo "Install with: npm install -g pm2"
  exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ package.json not found. Are you in the right directory?${NC}"
  exit 1
fi

echo -e "${YELLOW}[1/5]${NC} Pulling latest code..."
git pull origin main || echo "Already up to date"

echo ""
echo -e "${YELLOW}[2/5]${NC} Installing dependencies..."
npm install --production=false

echo ""
echo -e "${YELLOW}[3/5]${NC} Building TypeScript..."
npm run build

echo ""
echo -e "${YELLOW}[4/5]${NC} Generating Prisma client..."
npm run prisma:generate

echo ""
echo -e "${YELLOW}[5/5]${NC} Starting PM2 process..."
pm2 start ecosystem.config.js

echo ""
echo -e "${GREEN}✅ Portfolio Backend started successfully!${NC}"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "Useful commands:"
echo "  pm2 logs portfolio-backend      # View logs"
echo "  pm2 monit                        # Monitor resources"
echo "  pm2 restart portfolio-backend    # Restart service"
echo "  pm2 stop portfolio-backend       # Stop service"
echo "  curl http://localhost:3001/health # Test health endpoint"
