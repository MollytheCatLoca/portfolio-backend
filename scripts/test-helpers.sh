#!/bin/bash

##############################################################################
# Test Helpers for Portfolio Backend
# Funciones auxiliares para testing automatizado
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# API Configuration
API_BASE_URL="http://localhost:3001"
API_KEY="${API_KEY:-PORTFOLIO_TEST_API_KEY_123456}"

# Function: Print section header
print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
  echo ""
}

# Function: Print test header
print_test() {
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  echo -e "${YELLOW}[Test $TESTS_TOTAL]${NC} $1"
}

# Function: Assert test passed
assert_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}  ✅ PASS${NC} - $1"
}

# Function: Assert test failed
assert_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}  ❌ FAIL${NC} - $1"
}

# Function: Test HTTP status code
test_http_status() {
  local url="$1"
  local expected_status="$2"
  local description="$3"
  local headers="$4"

  print_test "$description"

  local actual_status
  if [ -z "$headers" ]; then
    actual_status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  else
    actual_status=$(curl -s -o /dev/null -w "%{http_code}" -H "$headers" "$url")
  fi

  if [ "$actual_status" -eq "$expected_status" ]; then
    assert_pass "Status $actual_status (expected $expected_status)"
  else
    assert_fail "Status $actual_status (expected $expected_status)"
  fi
}

# Function: Test JSON response contains field
test_json_field() {
  local url="$1"
  local field="$2"
  local description="$3"
  local headers="$4"

  print_test "$description"

  local response
  if [ -z "$headers" ]; then
    response=$(curl -s "$url")
  else
    response=$(curl -s -H "$headers" "$url")
  fi

  if echo "$response" | grep -q "\"$field\""; then
    assert_pass "Field '$field' found in response"
    echo "     Response: $(echo $response | head -c 100)..."
  else
    assert_fail "Field '$field' not found in response"
    echo "     Response: $response"
  fi
}

# Function: Test endpoint reachability
test_endpoint_reachable() {
  local url="$1"
  local description="$2"

  print_test "$description"

  if curl -s -o /dev/null -w "%{http_code}" "$url" > /dev/null 2>&1; then
    assert_pass "Endpoint reachable"
  else
    assert_fail "Endpoint not reachable"
  fi
}

# Function: Print test summary
print_summary() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}TEST SUMMARY${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "Total Tests:  ${YELLOW}$TESTS_TOTAL${NC}"
  echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"

  if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TESTS PASSED! 🎉${NC}"
    echo ""
    return 0
  else
    echo ""
    echo -e "${RED}⚠️  SOME TESTS FAILED ⚠️${NC}"
    echo ""
    return 1
  fi
}

# Function: Wait for server to be ready
wait_for_server() {
  local max_attempts=30
  local attempt=1

  echo -e "${YELLOW}Waiting for server to be ready...${NC}"

  while [ $attempt -le $max_attempts ]; do
    if curl -s "$API_BASE_URL/health" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Server is ready!${NC}"
      return 0
    fi

    echo -e "  Attempt $attempt/$max_attempts..."
    sleep 1
    attempt=$((attempt + 1))
  done

  echo -e "${RED}❌ Server failed to start after $max_attempts seconds${NC}"
  return 1
}
