const CASE_ID_PATTERN =
  /(?:kiket-case|caseId|case)\s*[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

export function recordField(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function resolveCaseId(...sources: unknown[]): string | undefined {
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    const match = source.match(CASE_ID_PATTERN);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function normalizeSourceTime(value: unknown, fallback: Date): Date {
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
  if (typeof value !== 'string') return fallback;
  const normalized = value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value;
  const parsed = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function deliveryId(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  const value = metadata.deliveryId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function actorFromUser(user: Record<string, unknown>): Record<string, unknown> {
  const sysId = stringField(user, 'sys_id');
  const userName = stringField(user, 'user_name') ?? stringField(user, 'username');
  const displayName = stringField(user, 'name') ?? stringField(user, 'display_value');
  const email = stringField(user, 'email');
  return {
    ...(sysId ? { sysId } : {}),
    ...(userName ? { userName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
  };
}

export function resolveRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const record = recordField(payload, 'record');
  if (Object.keys(record).length > 0) return record;
  if (stringField(payload, 'number') || stringField(payload, 'sys_id')) return payload;
  return {};
}

export function recordNumber(record: Record<string, unknown>): string | undefined {
  return stringField(record, 'number') ?? stringField(record, 'sys_id');
}

export function recordTable(payload: Record<string, unknown>, record: Record<string, unknown>): string | undefined {
  return (
    stringField(payload, 'table') ?? stringField(record, 'sys_class_name') ?? stringField(payload, 'sys_class_name')
  );
}

export function recordStateDisplay(record: Record<string, unknown>): string | undefined {
  return (
    stringField(record, 'state_display') ??
    stringField(record, 'state_label') ??
    stringField(record, 'incident_state_display') ??
    stringField(record, 'state')
  );
}

export function recordAssignee(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const assignedTo = recordField(record, 'assigned_to');
  if (Object.keys(assignedTo).length > 0) {
    const displayName = stringField(assignedTo, 'display_value') ?? stringField(assignedTo, 'name');
    const sysId = stringField(assignedTo, 'value') ?? stringField(assignedTo, 'sys_id');
    if (displayName || sysId) {
      return {
        ...(sysId ? { sysId } : {}),
        ...(displayName ? { displayName } : {}),
      };
    }
  }
  const assigneeName = stringField(record, 'assigned_to_display');
  if (assigneeName) return { displayName: assigneeName };
  return undefined;
}

export function recordShortDescription(record: Record<string, unknown>): string | undefined {
  return stringField(record, 'short_description') ?? stringField(record, 'title');
}

export function recordDescription(record: Record<string, unknown>): string | undefined {
  return stringField(record, 'description') ?? stringField(record, 'work_notes');
}

export function recordUpdatedAt(record: Record<string, unknown>): unknown {
  return record.sys_updated_on ?? record.sys_created_on;
}

export function statusChangeFromChanges(payload: Record<string, unknown>): {
  fromStatus?: string;
  toStatus?: string;
} {
  const changes = payload.changes;
  if (!Array.isArray(changes)) return {};
  for (const item of changes) {
    if (!item || typeof item !== 'object') continue;
    const change = item as Record<string, unknown>;
    const field = stringField(change, 'field');
    if (field !== 'state' && field !== 'incident_state') continue;
    return {
      fromStatus: stringField(change, 'old_display') ?? stringField(change, 'old_value'),
      toStatus: stringField(change, 'new_display') ?? stringField(change, 'new_value'),
    };
  }
  return {};
}

export function resolveWebhookEvent(payload: Record<string, unknown>, sourceEventType: string): string {
  return (
    stringField(payload, 'webhookEvent') ??
    stringField(payload, 'eventType') ??
    stringField(payload, 'event_type') ??
    sourceEventType
  );
}
