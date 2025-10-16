#!/bin/bash

##############################################################################
# VPS Testing Script (Standalone)
#
# Executes the full test suite on the VPS without deploying
#
# Usage:
#   Local:  ./scripts/test-vps.sh
#   VPS:    cd /root/portfolio-backend && ./scripts/test-vps.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - Tests failed
##############################################################################

# Check if we're on VPS or local
if [ -f "/root/portfolio-backend/.env" ]; then
  # Running on VPS
  cd /root/portfolio-backend

  # Get API key from .env
  export API_KEY=$(grep '^API_KEY=' .env | cut -d'=' -f2 | tr -d '"')
  export API_URL="http://localhost:3001/api"

  # Run tests
  ./scripts/test-api.sh
else
  # Running from local, SSH to VPS
  ssh root@82.29.58.172 "cd /root/portfolio-backend && ./scripts/test-vps.sh"
fi
