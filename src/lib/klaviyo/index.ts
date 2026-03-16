// src/lib/klaviyo/index.ts
// ─── Klaviyo — Public API ─────────────────────────────────────────────────────
//
// Import everything you need from this single entry point:
//
//   import { trackEvent, identifyUser, subscribeToList, KlaviyoEvents }
//     from '@/lib/klaviyo';
//
// ─────────────────────────────────────────────────────────────────────────────

export { trackEvent }      from './trackEvent';
export { identifyUser }    from './identifyUser';
export { subscribeToList } from './subscribeToList';

// Types & constants — re-exported so consumers don't need deep imports
export type {
  KlaviyoEventInput,
  KlaviyoProfileAttributes,
  IdentifyUserInput,
  SubscribeToListInput,
  KlaviyoResult,
  KlaviyoApiError,
  KlaviyoErrorResponse,
  KlaviyoEventName,
  KlaviyoSubscriptionChannel,
  ISODateString,
} from './types';

export { KlaviyoEvents } from './types';