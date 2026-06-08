import { describe, expect, it } from 'vitest';
import { normalizeServiceNowRawEvent } from '../src/normalize.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const receivedAt = new Date('2026-05-22T10:00:01.000Z');

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
  it('normalizes record lifecycle updates', () => {
    const normalized = normalizeServiceNowRawEvent(
      baseContext({
        payload: {
          webhookEvent: 'servicenow:record_updated',
          record: {
            number: 'INC0010001',
            short_description: 'VPN outage',
            description: `case: ${CASE_ID}`,
            state_display: 'In Progress',
            sys_updated_on: '2026-05-22 11:00:00',
          },
        },
      }),
    );

    expect(normalized.eventType).toBe('case.updated');
    expect(normalized.caseId).toBe(CASE_ID);
    expect(normalized.evidence[0]?.evidenceType).toBe('servicenow_task');
  });

  it('normalizes work note comments', () => {
    const normalized = normalizeServiceNowRawEvent(
      baseContext({
        sourceEventType: 'servicenow:work_note_created',
        payload: {
          webhookEvent: 'servicenow:work_note_created',
          record: {
            number: 'INC0010001',
            description: `case: ${CASE_ID}`,
          },
          work_note: {
            sys_id: 'note-1',
            value: 'Customer confirmed fix',
            sys_created_on: '2026-05-22 12:00:00',
          },
        },
      }),
    );

    expect(normalized.eventType).toBe('evidence.observed');
    expect(normalized.caseId).toBe(CASE_ID);
    expect(normalized.evidence[0]?.evidenceType).toBe('servicenow_comment');
  });
});
