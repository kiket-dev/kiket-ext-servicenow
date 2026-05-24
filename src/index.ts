export {
  SERVICENOW_ADAPTER_EVIDENCE_TYPES,
  SERVICENOW_ADAPTER_SOURCE_EVENT_TYPES,
  normalizeServiceNowRawEvent,
} from './normalize.js';
export type { NormalizedOperationalEventOutput, ServiceNowRawEventContext } from './types.js';
export { resolveCaseId } from './utils.js';
