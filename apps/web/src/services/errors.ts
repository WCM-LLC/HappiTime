type ErrorReportingProvider = 'sentry' | 'bugsnag' | 'auto' | 'none';

export type ErrorContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export type ErrorUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
};

function normalizeProvider(value: string | undefined): ErrorReportingProvider {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'sentry' || v === 'bugsnag' || v === 'none') return v;
  return 'auto';
}

function shouldDebug(): boolean {
  return process.env.NODE_ENV === 'development';
}

function getScope(): any {
  return globalThis as any;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error');
  }
}

export function captureError(error: unknown, context?: ErrorContext) {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER);
  const scope = getScope();
  const err = normalizeError(error);
  let sent = false;

  if ((provider === 'sentry' || provider === 'auto') && scope.Sentry?.captureException) {
    if (context?.tags && scope.Sentry?.setTags) {
      scope.Sentry.setTags(context.tags);
    }
    if (context?.extra && scope.Sentry?.setExtras) {
      scope.Sentry.setExtras(context.extra);
    }
    scope.Sentry.captureException(err);
    sent = true;
  }

  if (!sent && (provider === 'bugsnag' || provider === 'auto') && scope.Bugsnag?.notify) {
    scope.Bugsnag.notify(err, (event: any) => {
      if (context?.tags) {
        event.addMetadata('tags', context.tags);
      }
      if (context?.extra) {
        event.addMetadata('extra', context.extra);
      }
    });
    sent = true;
  }

  if (!sent && shouldDebug() && typeof console !== 'undefined') {
    console.error('[error]', err, context ?? {});
  }
}

export function captureMessage(message: string, context?: ErrorContext) {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER);
  const scope = getScope();
  let sent = false;

  if ((provider === 'sentry' || provider === 'auto') && scope.Sentry?.captureMessage) {
    if (context?.tags && scope.Sentry?.setTags) {
      scope.Sentry.setTags(context.tags);
    }
    if (context?.extra && scope.Sentry?.setExtras) {
      scope.Sentry.setExtras(context.extra);
    }
    scope.Sentry.captureMessage(message);
    sent = true;
  }

  if (!sent && (provider === 'bugsnag' || provider === 'auto') && scope.Bugsnag?.notify) {
    scope.Bugsnag.notify(new Error(message), (event: any) => {
      if (context?.tags) {
        event.addMetadata('tags', context.tags);
      }
      if (context?.extra) {
        event.addMetadata('extra', context.extra);
      }
    });
    sent = true;
  }

  if (!sent && shouldDebug() && typeof console !== 'undefined') {
    console.warn('[error]', message, context ?? {});
  }
}

export function setErrorUser(user: ErrorUser | null) {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER);
  const scope = getScope();

  if ((provider === 'sentry' || provider === 'auto') && scope.Sentry?.setUser) {
    scope.Sentry.setUser(
      user
        ? {
            id: user.id ?? undefined,
            email: user.email ?? undefined,
            username: user.name ?? undefined,
          }
        : null
    );
    return;
  }

  if ((provider === 'bugsnag' || provider === 'auto') && scope.Bugsnag?.setUser) {
    if (!user) {
      scope.Bugsnag.setUser();
      return;
    }
    scope.Bugsnag.setUser(user.id ?? undefined, user.email ?? undefined, user.name ?? undefined);
  }
}

export function addErrorBreadcrumb(message: string, metadata?: Record<string, unknown>) {
  const provider = normalizeProvider(process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER);
  const scope = getScope();

  if ((provider === 'sentry' || provider === 'auto') && scope.Sentry?.addBreadcrumb) {
    scope.Sentry.addBreadcrumb({ message, data: metadata });
    return;
  }

  if ((provider === 'bugsnag' || provider === 'auto') && scope.Bugsnag?.leaveBreadcrumb) {
    scope.Bugsnag.leaveBreadcrumb(message, metadata);
  }
}
