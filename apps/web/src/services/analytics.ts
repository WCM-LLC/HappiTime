type AnalyticsProvider = 'posthog' | 'mixpanel' | 'amplitude' | 'segment' | 'none';

export type AnalyticsEventProps = Record<string, unknown>;
export type AnalyticsUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type AnalyticsEvent = {
  name: string;
  props?: AnalyticsEventProps;
};

const MAX_QUEUE_SIZE = 50;
const pendingEvents: AnalyticsEvent[] = [];

let defaultContext: AnalyticsEventProps = {};

/** Maps NEXT_PUBLIC_ANALYTICS_PROVIDER env value to a typed provider enum; returns 'none' for unknown values. */
function normalizeProvider(value: string | undefined): AnalyticsProvider {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'posthog' || v === 'mixpanel' || v === 'amplitude' || v === 'segment') {
    return v;
  }
  return 'none';
}

/** Returns true when analytics debug logging is enabled via env or development mode. */
function shouldDebug(): boolean {
  return (
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === 'true' ||
    process.env.NODE_ENV === 'development'
  );
}

/** Returns true if the browser reports network connectivity; defaults true in non-browser environments. */
function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/** Logs an analytics debug message to the console when debug mode is active. */
function debug(message: string, payload?: unknown) {
  if (!shouldDebug()) return;
  if (typeof console !== 'undefined') {
    console.log(`[analytics] ${message}`, payload ?? '');
  }
}

/** Adds an event to the pending queue; evicts the oldest entry when the queue is full. */
function enqueue(event: AnalyticsEvent) {
  pendingEvents.push(event);
  if (pendingEvents.length > MAX_QUEUE_SIZE) {
    pendingEvents.shift();
  }
}

/** Returns globalThis typed loosely so analytics SDKs can be accessed by name. */
function getScope(): any {
  return globalThis as any;
}

/**
 * Dispatches a track event to the active analytics provider.
 * Returns true if the provider was found and the event was delivered.
 */
function sendToProvider(event: AnalyticsEvent): boolean {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER);
  const scope = getScope();

  switch (provider) {
    case 'posthog': {
      if (typeof scope.posthog?.capture === 'function') {
        scope.posthog.capture(event.name, event.props);
        return true;
      }
      break;
    }
    case 'mixpanel': {
      if (typeof scope.mixpanel?.track === 'function') {
        scope.mixpanel.track(event.name, event.props);
        return true;
      }
      break;
    }
    case 'amplitude': {
      if (typeof scope.amplitude?.track === 'function') {
        scope.amplitude.track(event.name, event.props);
        return true;
      }
      if (typeof scope.amplitude?.logEvent === 'function') {
        scope.amplitude.logEvent(event.name, event.props);
        return true;
      }
      if (typeof scope.amplitude?.getInstance === 'function') {
        const instance = scope.amplitude.getInstance();
        if (typeof instance?.logEvent === 'function') {
          instance.logEvent(event.name, event.props);
          return true;
        }
      }
      break;
    }
    case 'segment': {
      if (typeof scope.analytics?.track === 'function') {
        scope.analytics.track(event.name, event.props);
        return true;
      }
      break;
    }
    default:
      break;
  }

  return false;
}

/**
 * Sends a user-identify call to the active analytics provider.
 * Returns true if the provider accepted the call.
 */
function sendIdentify(userId: string, traits?: AnalyticsEventProps): boolean {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER);
  const scope = getScope();

  switch (provider) {
    case 'posthog': {
      if (typeof scope.posthog?.identify === 'function') {
        scope.posthog.identify(userId, traits);
        return true;
      }
      break;
    }
    case 'mixpanel': {
      if (typeof scope.mixpanel?.identify === 'function') {
        scope.mixpanel.identify(userId);
        if (traits && typeof scope.mixpanel?.people?.set === 'function') {
          scope.mixpanel.people.set(traits);
        }
        return true;
      }
      break;
    }
    case 'amplitude': {
      if (typeof scope.amplitude?.setUserId === 'function') {
        scope.amplitude.setUserId(userId);
        if (traits && typeof scope.amplitude?.setUserProperties === 'function') {
          scope.amplitude.setUserProperties(traits);
        }
        return true;
      }
      if (typeof scope.amplitude?.getInstance === 'function') {
        const instance = scope.amplitude.getInstance();
        if (typeof instance?.setUserId === 'function') {
          instance.setUserId(userId);
          if (traits && typeof instance?.setUserProperties === 'function') {
            instance.setUserProperties(traits);
          }
          return true;
        }
      }
      break;
    }
    case 'segment': {
      if (typeof scope.analytics?.identify === 'function') {
        scope.analytics.identify(userId, traits);
        return true;
      }
      break;
    }
    default:
      break;
  }

  return false;
}

/**
 * Clears the user identity from the active analytics provider.
 * Returns true if the provider accepted the reset call.
 */
function sendReset(): boolean {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER);
  const scope = getScope();

  switch (provider) {
    case 'posthog': {
      if (typeof scope.posthog?.reset === 'function') {
        scope.posthog.reset();
        return true;
      }
      break;
    }
    case 'mixpanel': {
      if (typeof scope.mixpanel?.reset === 'function') {
        scope.mixpanel.reset();
        return true;
      }
      break;
    }
    case 'amplitude': {
      if (typeof scope.amplitude?.setUserId === 'function') {
        scope.amplitude.setUserId(null);
        return true;
      }
      if (typeof scope.amplitude?.getInstance === 'function') {
        const instance = scope.amplitude.getInstance();
        if (typeof instance?.setUserId === 'function') {
          instance.setUserId(null);
          return true;
        }
      }
      break;
    }
    case 'segment': {
      if (typeof scope.analytics?.reset === 'function') {
        scope.analytics.reset();
        return true;
      }
      break;
    }
    default:
      break;
  }

  return false;
}

/** Merges per-event props with the module-level defaultContext. */
function mergeProps(props?: AnalyticsEventProps): AnalyticsEventProps | undefined {
  if (!props && Object.keys(defaultContext).length === 0) return props;
  return { ...defaultContext, ...(props ?? {}) };
}

/** Sets default properties merged into every subsequent trackEvent call. Pass undefined to clear. */
export function setAnalyticsContext(props?: AnalyticsEventProps) {
  defaultContext = props ? { ...props } : {};
}

/**
 * Tracks a named event. Events are queued when offline or when the provider SDK
 * is not yet loaded; flushed by flushAnalytics() once the provider becomes available.
 */
export function trackEvent(name: string, props?: AnalyticsEventProps) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const event: AnalyticsEvent = { name: trimmed, props: mergeProps(props) };

  if (!isOnline()) {
    enqueue(event);
    debug('queued (offline)', event);
    return;
  }

  if (!sendToProvider(event)) {
    enqueue(event);
    debug('queued (provider unavailable)', event);
    return;
  }

  debug('sent', event);
}

/** Associates a user with the analytics session; silently no-ops when offline or provider is missing. */
export function identifyUser(user: AnalyticsUser, traits?: AnalyticsEventProps) {
  if (!user?.id) return;
  const payload = traits ?? {
    email: user.email ?? undefined,
    name: user.name ?? undefined,
  };

  if (!isOnline()) {
    debug('identify skipped (offline)', { user, payload });
    return;
  }

  if (!sendIdentify(user.id, payload)) {
    debug('identify skipped (provider unavailable)', { user, payload });
  }
}

/** Clears defaultContext and resets user identity in the provider; call on sign-out. */
export function resetAnalytics() {
  defaultContext = {};
  sendReset();
}

/** Drains the offline event queue by replaying events to the provider; retains any that still fail. */
export function flushAnalytics() {
  if (!isOnline() || pendingEvents.length === 0) return;

  const remaining: AnalyticsEvent[] = [];
  for (const event of pendingEvents) {
    if (!sendToProvider(event)) {
      remaining.push(event);
    }
  }
  pendingEvents.length = 0;
  pendingEvents.push(...remaining);
}
