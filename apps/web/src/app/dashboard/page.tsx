import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { createOrganization, deleteOrganization, updateOrganization } from '../../actions/dashboard-actions';
import ConfirmDeleteForm from '@/components/ConfirmDeleteForm';

type MembershipRow = {
  role: string;
  organizations: { id: string; name: string; slug: string }[];
};

const DASHBOARD_ERROR_MESSAGES: Record<string, string> = {
  organization_already_exists:
    'An organization with that name already exists. Ask an owner for access or choose a different organization name.',
  slug_taken: 'That organization slug is already in use. Choose a different slug.',
  missing_org_name: 'Enter an organization name.',
  not_org_owner: 'You must be an organization owner to make that change.',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const pageError = sp?.error;
  const pageErrorMessage = pageError ? DASHBOARD_ERROR_MESSAGES[pageError] ?? pageError : null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect('/login');
  }

  const { data, error } = await supabase
    .from("org_members")
    .select("role, organizations:organizations ( id, name, slug )")
    .eq("user_id", user.id);

  const orgMemberships =
    (data ?? [])
      .filter((m: any) => m.organizations)
      .map((m: any) => ({
        id: String(m.organizations.id),
        name: String(m.organizations.name),
        slug: String(m.organizations.slug ?? ''),
        role: String(m.role),
      }));

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-body-sm text-muted mt-1">Manage your organizations and venues.</p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground hover:bg-surface border border-border transition-colors cursor-pointer">
              Admin Console
            </span>
          </Link>
        </div>

        {/* Error Banner */}
        {pageErrorMessage ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Something went wrong</p>
            <p className="text-body-sm text-error/80 mt-0.5">{pageErrorMessage}</p>
          </div>
        ) : null}

        {/* Create Organization */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">New organization</h2>
            <p className="text-body-sm text-muted mt-0.5">
              Organizations group multiple venues with shared staff access.
            </p>
          </div>
          <form className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="org-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                Organization name
              </label>
              <input
                id="org-name"
                name="name"
                placeholder="e.g., The Smith Group"
                required
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>
            <button
              formAction={createOrganization}
              className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer shrink-0"
            >
              Create
            </button>
          </form>
        </div>

        {/* Organizations List */}
        <div>
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Your organizations</h2>

          {error ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3">
              <p className="text-body-sm font-medium text-error">Database error</p>
              <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
            </div>
          ) : null}

          {orgMemberships.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
              <div className="text-muted-light text-display-md mb-3">&#9881;</div>
              <p className="text-body-sm font-medium text-foreground">No organizations yet</p>
              <p className="text-body-sm text-muted mt-1">
                Create your first organization above to get started.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {orgMemberships.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-border bg-surface shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      {/* Avatar / Icon */}
                      <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                        <span className="text-heading-sm font-bold text-brand-dark">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-body-md font-semibold text-foreground">{m.name}</h3>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-background text-muted border border-border mt-1">
                          {m.role}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/orgs/${m.id}`}>
                        <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer">
                          Manage
                        </span>
                      </Link>
                      {m.role === 'owner' ? (
                        <ConfirmDeleteForm
                          action={deleteOrganization.bind(null, m.id)}
                          message="This will permanently delete all data for this organization. Continue?"
                        >
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </ConfirmDeleteForm>
                      ) : null}
                    </div>
                  </div>

                  {/* Inline Edit (owners only) */}
                  {m.role === 'owner' ? (
                    <div className="border-t border-border px-5 py-4 bg-background/50">
                      <form className="flex items-end gap-3 flex-wrap">
                        <div className="flex-1 min-w-[180px]">
                          <label className="text-caption font-medium text-muted block mb-1">Name</label>
                          <input
                            name="name"
                            defaultValue={m.name}
                            placeholder="Organization name"
                            required
                            className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-caption font-medium text-muted block mb-1">Slug</label>
                          <input
                            name="slug"
                            defaultValue={m.slug}
                            placeholder="url-slug"
                            className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                          />
                        </div>
                        <button
                          formAction={updateOrganization.bind(null, m.id)}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer shrink-0"
                        >
                          Save changes
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
