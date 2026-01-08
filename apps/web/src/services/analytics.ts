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

function normalizeProvider(value: string | undefined): AnalyticsProvider {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'posthog' || v === 'mixpanel' || v === 'amplitude' || v === 'segment') {
    return v;
  }
  return 'none';
}

function shouldDebug(): boolean {
  return (
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === 'true' ||
    process.env.NODE_ENV === 'development'
  );
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function debug(message: string, payload?: unknown) {
  if (!shouldDebug()) return;
  if (typeof console !== 'undefined') {
    console.log(`[analytics] ${message}`, payload ?? '');
  }
}

function enqueue(event: AnalyticsEvent) {
  pendingEvents.push(event);
  if (pendingEvents.length > MAX_QUEUE_SIZE) {
    pendingEvents.shift();
  }
}

function getScope(): any {
  return globalThis as any;
}

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

function mergeProps(props?: AnalyticsEventProps): AnalyticsEventProps | undefined {
  if (!props && Object.keys(defaultContext).length === 0) return props;
  return { ...defaultContext, ...(props ?? {}) };
}

export function setAnalyticsContext(props?: AnalyticsEventProps) {
  defaultContext = props ? { ...props } : {};
}

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

export function resetAnalytics() {
  defaultContext = {};
  sendReset();
}

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
