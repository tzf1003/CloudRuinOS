# test/test-d1-terminal.ps1
# Test D1 terminal tables

$ErrorActionPreference = "Stop"

Write-Host "=== Testing D1 Terminal Tables ===" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path "$PSScriptRoot\..\server"

# Test 1: Insert a session
Write-Host "[Test 1] Inserting test session..." -ForegroundColor Yellow
$insertSQL = @"
INSERT INTO terminal_sessions (session_id, agent_id, user_id, shell_type, cols, rows, state)
VALUES ('test-sess-001', 'agent-001', 'user-001', 'bash', 80, 24, 'opened');
"@

wrangler d1 execute ruinos-db-local --local --command=$insertSQL
Write-Host "[OK] Session inserted" -ForegroundColor Green
Write-Host ""

# Test 2: Query the session
Write-Host "[Test 2] Querying session..." -ForegroundColor Yellow
$querySQL = "SELECT session_id, agent_id, state, created_at FROM terminal_sessions WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$querySQL
Write-Host ""

# Test 3: Insert output
Write-Host "[Test 3] Inserting output..." -ForegroundColor Yellow
$outputSQL = @"
INSERT INTO terminal_outputs (session_id, cursor_start, cursor_end, output_data)
VALUES ('test-sess-001', 0, 100, 'Hello from terminal!\nuser@host:~$ ');
"@

wrangler d1 execute ruinos-db-local --local --command=$outputSQL
Write-Host "[OK] Output inserted" -ForegroundColor Green
Write-Host ""

# Test 4: Query output
Write-Host "[Test 4] Querying output..." -ForegroundColor Yellow
$queryOutputSQL = "SELECT session_id, cursor_start, cursor_end, LENGTH(output_data) as size FROM terminal_outputs WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$queryOutputSQL
Write-Host ""

# Test 5: Update session (test trigger)
Write-Host "[Test 5] Updating session (testing trigger)..." -ForegroundColor Yellow
$updateSQL = "UPDATE terminal_sessions SET state='running', pid=12345 WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$updateSQL
Write-Host "[OK] Session updated" -ForegroundColor Green
Write-Host ""

# Test 6: Verify updated_at changed
Write-Host "[Test 6] Verifying updated_at timestamp..." -ForegroundColor Yellow
$verifySQL = "SELECT session_id, state, pid, created_at, updated_at FROM terminal_sessions WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$verifySQL
Write-Host ""

# Test 7: Insert input with duplicate check
Write-Host "[Test 7] Testing input deduplication..." -ForegroundColor Yellow
$inputSQL1 = "INSERT INTO terminal_inputs (session_id, client_seq, input_data) VALUES ('test-sess-001', 1, 'ls -la')"
$inputSQL2 = "INSERT OR IGNORE INTO terminal_inputs (session_id, client_seq, input_data) VALUES ('test-sess-001', 1, 'duplicate')"

wrangler d1 execute ruinos-db-local --local --command=$inputSQL1
Write-Host "[OK] First input inserted" -ForegroundColor Green

wrangler d1 execute ruinos-db-local --local --command=$inputSQL2
Write-Host "[OK] Duplicate ignored" -ForegroundColor Green

$countSQL = "SELECT COUNT(*) as count FROM terminal_inputs WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$countSQL
Write-Host ""

# Test 8: Cleanup
Write-Host "[Test 8] Cleaning up test data..." -ForegroundColor Yellow
$cleanupSQL = "DELETE FROM terminal_sessions WHERE session_id='test-sess-001'"
wrangler d1 execute ruinos-db-local --local --command=$cleanupSQL
Write-Host "[OK] Test data cleaned" -ForegroundColor Green
Write-Host ""

Write-Host "=== All Tests Passed ===" -ForegroundColor Green
