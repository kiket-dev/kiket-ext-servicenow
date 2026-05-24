import type { NormalizedOperationalEventOutput, ServiceNowRawEventContext } from './types.js';
import {
  actorFromUser,
  deliveryId,
  normalizeSourceTime,
  recordAssignee,
  recordDescription,
  recordField,
  recordNumber,
  recordShortDescription,
  recordStateDisplay,
  recordTable,
  recordUpdatedAt,
  resolveCaseId,
  resolveRecord,
  resolveWebhookEvent,
  statusChangeFromChanges,
  stringField,
} from './utils.js';

function baseFields(ctx: ServiceNowRawEventContext) {
  return {
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId ?? undefined,
    processId: ctx.processId ?? undefined,
    correlationIds: [ctx.rawEventId, ctx.idempotencyKey],
    sourceSystem: 'servicenow' as const,
  };
}

function normalizeRecordLifecycle(ctx: ServiceNowRawEventContext): NormalizedOperationalEventOutput {
  const payload = ctx.payload;
  const record = resolveRecord(payload);
  const user = recordField(payload, 'user');
  const number = recordNumber(record);
  if (!number) throw new Error('Missing required field: recordNumber');

  const caseId = resolveCaseId(payload.caseId, recordDescription(record), recordShortDescription(record));
  if (!caseId) throw new Error('Missing required field: caseId');

  const table = recordTable(payload, record);
  const status = recordStateDisplay(record);
  const assignee = recordAssignee(record);
  const statusChange = statusChangeFromChanges(payload);
  const occurredAt = normalizeSourceTime(payload.timestamp ?? recordUpdatedAt(record), ctx.receivedAt);
  const actor = actorFromUser(user);
  const delivery = deliveryId(ctx.metadata);
  const summary = recordShortDescription(record) ?? number;
  const webhookEvent = resolveWebhookEvent(payload, ctx.sourceEventType);

  return {
    ...baseFields(ctx),
    caseId,
    eventType: 'case.updated',
    sourceObjectId: number,
    actor,
    subject: { type: 'servicenow_task', id: number, caseId, status, table },
    occurredAt,
    attributes: {
      table,
      status,
      assignee,
      statusChange,
      webhookEvent,
      deliveryId: delivery,
    },
    dedupeKey: `servicenow:task:${number}:${webhookEvent}`,
    evidence: [
      {
        evidenceType: 'servicenow_task',
        title: summary,
        sourceObjectId: number,
        capturedAt: occurredAt,
        payload: {
          number,
          table,
          status,
          assignee,
          statusChange,
          summary,
          webhookEvent,
          deliveryId: delivery,
        },
        dedupeKey: `servicenow:evidence:task:${number}`,
      },
    ],
    intents: [
      {
        type: 'case.link_external_evidence',
        targetType: 'case',
        targetId: caseId,
        reason: 'ServiceNow task lifecycle produced evidence for a linked operational case.',
        attributes: { evidenceType: 'servicenow_task', sourceObjectId: number },
        idempotencyKey: `servicenow:intent:link:${number}:${caseId}`,
      },
    ],
  };
}

function normalizeCommentCreated(ctx: ServiceNowRawEventContext): NormalizedOperationalEventOutput {
  const payload = ctx.payload;
  const record = resolveRecord(payload);
  const comment = recordField(payload, 'comment');
  const workNote = recordField(payload, 'work_note');
  const note = Object.keys(comment).length > 0 ? comment : workNote;
  const user = recordField(payload, 'user');
  const author = recordField(note, 'sys_created_by');
  const number = recordNumber(record);
  if (!number) throw new Error('Missing required field: recordNumber');

  const noteBody = stringField(note, 'value') ?? stringField(note, 'body');
  const caseId = resolveCaseId(payload.caseId, recordDescription(record), noteBody);
  if (!caseId) throw new Error('Missing required field: caseId');

  const commentId = stringField(note, 'sys_id') ?? ctx.idempotencyKey;
  const sourceObjectId = `${number}:comment:${commentId}`;
  const occurredAt = normalizeSourceTime(note.sys_created_on ?? payload.timestamp, ctx.receivedAt);
  const actor = Object.keys(author).length > 0 ? actorFromUser(author) : actorFromUser(user);
  const delivery = deliveryId(ctx.metadata);
  const bodyPreview = noteBody?.slice(0, 500);

  return {
    ...baseFields(ctx),
    caseId,
    eventType: 'evidence.observed',
    sourceObjectId,
    actor,
    subject: { type: 'servicenow_comment', id: commentId, recordNumber: number, caseId },
    occurredAt,
    attributes: {
      recordNumber: number,
      deliveryId: delivery,
    },
    dedupeKey: `servicenow:comment:${commentId}:created`,
    evidence: [
      {
        evidenceType: 'servicenow_comment',
        title: `ServiceNow comment on ${number}`,
        sourceObjectId,
        capturedAt: occurredAt,
        payload: {
          recordNumber: number,
          commentId,
          bodyPreview,
          actor,
          deliveryId: delivery,
        },
        dedupeKey: `servicenow:evidence:comment:${commentId}`,
      },
    ],
    intents: [
      {
        type: 'case.link_external_evidence',
        targetType: 'case',
        targetId: caseId,
        reason: 'ServiceNow comment produced evidence for a linked operational case.',
        attributes: { evidenceType: 'servicenow_comment', sourceObjectId },
        idempotencyKey: `servicenow:intent:comment:${commentId}:${caseId}`,
      },
    ],
  };
}

export function normalizeServiceNowRawEvent(ctx: ServiceNowRawEventContext): NormalizedOperationalEventOutput {
  const webhookEvent = resolveWebhookEvent(ctx.payload, ctx.sourceEventType);
  if (
    webhookEvent === 'servicenow:comment_created' ||
    webhookEvent === 'servicenow:work_note_created' ||
    webhookEvent === 'comment_created' ||
    webhookEvent === 'work_note_created'
  ) {
    return normalizeCommentCreated(ctx);
  }
  if (
    webhookEvent === 'servicenow:record_created' ||
    webhookEvent === 'servicenow:record_updated' ||
    webhookEvent === 'record_created' ||
    webhookEvent === 'record_updated' ||
    webhookEvent === 'insert' ||
    webhookEvent === 'update'
  ) {
    return normalizeRecordLifecycle(ctx);
  }
  throw new Error(`Unsupported ServiceNow event for core normalization: ${webhookEvent}`);
}

export const SERVICENOW_ADAPTER_SOURCE_EVENT_TYPES = [
  'servicenow:record_created',
  'servicenow:record_updated',
  'servicenow:comment_created',
  'servicenow:work_note_created',
] as const;

export const SERVICENOW_ADAPTER_EVIDENCE_TYPES = ['servicenow_task', 'servicenow_comment'] as const;
