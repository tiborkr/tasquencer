import { type AuditContext } from "../../../components/audit/src/shared/context";
import { buildAuditInfo, auditInfoFromSpan } from "../../audit/integration";

export type AuditSpanResult = { spanId: string; context: AuditContext };

export function createActionAuditInfo(
  _parentContext: AuditContext | undefined,
  childContext: AuditContext,
  spanId: string | null
) {
  return buildAuditInfo(childContext, spanId);
}

export function createActivityAuditInfo(
  _parentContext: AuditContext | undefined,
  childContext: AuditContext,
  parentSpanId: string | null,
  activitySpan?: AuditSpanResult | null
) {
  return auditInfoFromSpan(
    childContext,
    parentSpanId,
    activitySpan ?? undefined
  );
}

export function auditInfoFromSpanResult(spanResult: AuditSpanResult) {
  return buildAuditInfo(spanResult.context, spanResult.spanId);
}
