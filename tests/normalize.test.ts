import { describe, expect, it } from 'vitest';
import { normalizeServiceNowRawEvent } from '../src/normalize.js';

const CASE_ID = '33333333-3333-4333-8333-333333333333';
const receivedAt = new Date('2026-04-25T10:00:01.000Z');

function baseContext(overrides: Partial<Parameters<typeof normalizeServiceNowRawEvent>[0]> = {}) {
  return {
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    processId: 'proc-1',
    rawEventId: 'raw-1',
    idempotencyKey: 'idem-1',
    sourceEventType: 'servicenow:record_updated',
    receivedAt,
    payload: {},
    metadata: { deliveryId: 'delivery-1' },
    ...overrides,
  };
}

describe('normalizeServiceNowRawEvent', () => {
  it('normalizes record updated events with status change evidence', () => {
    const normalized = normalizeServiceNowRawEvent(
      baseContext({
        payload: {
          eventType: 'servicenow:record_updated',
          table: 'incident',
          timestamp: '2026-04-25 11:00:00',
          user: { sys_id: 'user-1', user_name: 'alex.owner', name: 'Alex Owner' },
          record: {
            sys_id: 'abc123',
            number: 'INC0001001',
            state: '2',
            state_display: 'In Progress',
            short_description: 'Deploy billing service',
            description: `case: ${CASE_ID}`,
            assigned_to: { value: 'user-1', display_value: 'Alex Owner' },
            sys_updated_on: '2026-04-25 11:00:00',
          },
          changes: [{ field: 'state', old_display: 'New', new_display: 'In Progress' }],
        },
      }),
    );

    expect(normalized.eventType).toBe('case.updated');
    expect(normalized.caseId).toBe(CASE_ID);
    expect(normalized.sourceObjectId).toBe('INC0001001');
    expect(normalized.attributes.statusChange).toEqual({ fromStatus: 'New', toStatus: 'In Progress' });
    expect(normalized.evidence[0]?.evidenceType).toBe('servicenow_task');
  });

  it('normalizes comment created events into evidence', () => {
    const normalized = normalizeServiceNowRawEvent(
      baseContext({
        sourceEventType: 'servicenow:comment_created',
        payload: {
          eventType: 'servicenow:comment_created',
          record: {
            number: 'CHG0002002',
            sys_id: 'rec-1',
            short_description: 'Change request follow-up',
            description: `kiket-case: ${CASE_ID}`,
          },
          comment: {
            sys_id: 'comment-1',
            value: 'Remediation complete',
            sys_created_on: '2026-04-25 12:00:00',
            sys_created_by: { user_name: 'reviewer', name: 'Reviewer' },
          },
        },
      }),
    );

    expect(normalized.eventType).toBe('evidence.observed');
    expect(normalized.caseId).toBe(CASE_ID);
    expect(normalized.evidence[0]?.evidenceType).toBe('servicenow_comment');
  });

  it('rejects unsupported webhook events', () => {
    expect(() =>
      normalizeServiceNowRawEvent(
        baseContext({
          sourceEventType: 'catalog_updated',
          payload: { eventType: 'catalog_updated' },
        }),
      ),
    ).toThrow(/Unsupported ServiceNow event/);
  });
});
