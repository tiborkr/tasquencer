# Tasquencer Audit System Tests

This directory contains end-to-end tests for the Tasquencer audit system integration.

## Test Files

### Core Tests

- **e2e-simple-audit.test.ts** - Basic workflow tracing
  - Verifies trace creation for simple sequential workflows
  - Validates span persistence and hierarchy
  - Tests that all spans complete successfully

- **e2e-nested-audit.test.ts** - Nested workflow tracing
  - Tests single trace creation across parent and child workflows
  - Verifies correct span hierarchy with nested depth
  - Validates composite task span creation

- **e2e-failure-audit.test.ts** - Failure propagation tracing
  - Tests failed workflow state in trace
  - Verifies failed vs canceled span distinction
  - Validates error capture in failed spans

- **e2e-cross-mutation-audit.test.ts** - Context continuity
  - Tests audit context persistence across multiple mutations
  - Verifies no span duplication across mutations
  - Validates parent-child span relationships remain valid

- **e2e-scheduler-boundary.test.ts** - Scheduler context passing
  - Tests context serialization/deserialization
  - Validates all context fields are preserved

- **e2e-trace-queries.test.ts** - Audit API validation
  - Tests `getTrace` query returns correct data
  - Tests `getTraceWithSpans` returns ordered spans
  - Tests `listRecentTraces` returns traces in chronological order

### Test Helpers

- **helpers.test.ts** - Reusable audit test utilities (named `.test.ts` to prevent Convex deployment)
  - `waitForFlush()` - Wait for scheduled audit flush to complete
  - `getTrace()` - Fetch trace from database
  - `getTraceSpans()` - Fetch all spans for a trace
  - `getAuditContext()` - Fetch audit context from database
  - `expectTrace()` - Assert trace state and metadata
  - `verifySpanHierarchy()` - Validate span parent-child relationships
  - `expectAllSpansInTrace()` - Assert all spans belong to same trace
  - `expectNoDuplicateSpans()` - Check for span ID uniqueness
  - `expectSpanState()` - Assert span state and timing
  - `expectSpanError()` - Validate error details on failed spans

## Running Tests

### Run all audit tests

```bash
npm run test:once -- convex/tasquencer/__tests__/audit
```

### Run specific test file

```bash
npm run test:once -- convex/tasquencer/__tests__/audit/e2e-simple-audit.test.ts
```

### Run with watch mode (during development)

```bash
npm test -- convex/tasquencer/__tests__/audit
```

## Test Architecture

All tests follow the existing Tasquencer test pattern:

1. Use `convex-test` for test database
2. Use `vi.useFakeTimers()` for deterministic time control
3. Register/unregister workflows with `worfklowRegistry`
4. Use `waitForFlush()` to ensure audit data is persisted before assertions

## Success Criteria

### Critical (Must Pass)

- ✅ Trace created for every workflow with `traceId = workflowId`
- ✅ All spans persisted to database after flush
- ✅ Span hierarchy correct (depth, parentSpanId, path)
- ✅ Context persists across mutations via `auditContexts` table
- ✅ No span duplication
- ✅ Trace state transitions correct (running → completed/failed/canceled)
- ✅ All spans have valid timestamps (startedAt, endedAt, duration)

### Important (Should Pass)

- ✅ Incremental flush works (multiple flushes don't duplicate)
- ✅ Failure propagation traced correctly (failed vs canceled)
- ✅ Nested workflows in single trace
- ✅ Query helpers return correct data

## Troubleshooting

### Test Failures

**Problem:** `trace is null`

- **Cause:** Flush didn't complete
- **Solution:** Ensure `waitForFlush(t)` called after workflow operations

**Problem:** Spans missing from trace

- **Cause:** Audit disabled or buffer cleared prematurely
- **Solution:** Check audit config in `convex/tasquencer/audit/integration.ts`

**Problem:** Hierarchy verification fails

- **Cause:** Parent span missing or incorrect parentSpanId
- **Solution:** Check context passing between operations

**Problem:** Duplicate spans

- **Cause:** Multiple flushes without idempotent handling
- **Solution:** Verify flush implementation uses INSERT/PATCH correctly

**Problem:** Test timeout

- **Cause:** `waitForFlush()` waiting indefinitely
- **Solution:** Check that scheduled functions complete (fake timers advanced)

## Related Documentation

- [Audit System Test Plan](../../../../TASQUENCER_AUDIT_SYSTEM_TEST_PLAN.md)
- [Audit Architecture](../../../../AUDIT_ARCHITECTURE.md)
- [Audit Service](../../../audit/README.md)
- [Tasquencer Integration](../../audit/integration.ts)
