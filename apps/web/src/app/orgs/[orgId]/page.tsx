import Link from 'next/link';
import { Suspense } from 'react';
import UserBar from '@/components/layout/UserBar';
import MenuSectionItemAdder from '@/components/MenuSectionItemAdder';
import { FlashMessage } from '@/components/FlashMessage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import {
  createOrganizationMenu,
  createOrganizationMenuItem,
  createOrganizationMenuSection,
  createVenue,
  deleteOrganizationMenu,
  deleteOrganizationMenuItem,
  deleteOrganizationMenuSection,
  deleteVenue,
  publishOrganizationMenu,
  saveOrganizationMenu,
  syncOrganizationMenuToVenues,
  unpublishOrganizationMenu,
} from '../../../actions/organization-actions';
import { fetchVenuesByOrg, type VenueSummary as VenueRow } from '@happitime/shared-api';

const HH_STATUS_PUBLISHED = 'published';

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_happy_hour?: boolean;
  sort_order: number;
};

type MenuSection = {
  id: string;
  name: string;
  sort_order: number;
  menu_items: MenuItem[] | null;
};

type OrganizationMenu = {
  id: string;
  name: string;
  status?: string;
  is_active: boolean;
  menu_sections: MenuSection[] | null;
};

export default async function OrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const pageError = sp?.error;
  const fromAdmin = sp?.from === 'admin';

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Not authenticated.</p>
      </div>
    );
  }

  const userIsAdmin = await isAdminEmail(user.email);
  const supabase = (fromAdmin && userIsAdmin) ? createServiceClient() : await createClient();

  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  const isOwner = role === 'owner' || (fromAdmin && userIsAdmin);
  const canManageOrganizationMenus =
    isOwner || role === 'manager' || role === 'admin' || role === 'editor';

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id,name')
    .eq('id', orgId)
    .single();

  const { data: venues, error: venuesErr } = await fetchVenuesByOrg(supabase as any, orgId);
  const { data: organizationMenus, error: organizationMenusErr } = await supabase
    .from('menus')
    .select(
      'id,name,status,is_active,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order))'
    )
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .order('created_at', { ascending: false });

  const organizationMenuList = (organizationMenus as OrganizationMenu[] | null) ?? [];
  const inputCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';
  const btnPrimary =
    'inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer';
  const btnSecondary =
    'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer';
  const btnDanger =
    'inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer';

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href={fromAdmin ? '/admin' : '/dashboard'} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {fromAdmin ? 'Admin' : 'Dashboard'}
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">
              {orgErr ? 'Organization' : org?.name}
            </h1>
            <p className="text-body-sm text-muted mt-1">Manage venues, locations, and staff access.</p>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && !fromAdmin ? (
              <Link href={`/orgs/${orgId}/access`}>
                <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer">
                  Manage access
                </span>
              </Link>
            ) : null}
            <Link href={fromAdmin ? '/admin' : '/dashboard'}>
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                &larr; Back
              </span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {pageError ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Error</p>
            <p className="text-body-sm text-error/80 mt-0.5">{pageError}</p>
          </div>
        ) : null}

        <Suspense>
          <FlashMessage />
        </Suspense>

        {/* Add Venue Form */}
        {isOwner ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
            <div className="mb-4">
              <h2 className="text-heading-sm font-semibold text-foreground">Add a venue</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Add a new location to this organization.
              </p>
            </div>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="venue-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Venue name
                </label>
                <input
                  id="venue-name"
                  name="name"
                  placeholder="e.g., Smith's Taproom"
                  required
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="address" className="text-body-sm font-medium text-foreground block mb-1.5">
                    Street address
                  </label>
                  <input
                    id="address"
                    name="address"
                    placeholder="123 Main St"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="text-body-sm font-medium text-foreground block mb-1.5">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    placeholder="Austin"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="state" className="text-body-sm font-medium text-foreground block mb-1.5">
                    State
                  </label>
                  <input
                    id="state"
                    name="state"
                    placeholder="TX"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="zip" className="text-body-sm font-medium text-foreground block mb-1.5">
                    ZIP code
                  </label>
                  <input
                    id="zip"
                    name="zip"
                    placeholder="78701"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="timezone" className="text-body-sm font-medium text-foreground block mb-1.5">
                    Timezone
                  </label>
                  <input
                    id="timezone"
                    name="timezone"
                    defaultValue="America/Chicago"
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
              </div>
              <div>
                <button
                  formAction={createVenue.bind(null, orgId)}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
                >
                  Create venue
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Organization Menus */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-heading-sm font-semibold text-foreground">Organization menus</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Shared menu templates that venues can copy and customize locally.
              </p>
            </div>
          </div>

          {organizationMenusErr ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-5">
              <p className="text-body-sm font-medium text-error">Menus load error</p>
              <p className="text-body-sm text-error/80 mt-0.5">{organizationMenusErr.message}</p>
            </div>
          ) : null}

          {canManageOrganizationMenus ? (
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end mb-6">
              <div className="flex-1">
                <label className="text-body-sm font-medium text-foreground block mb-1.5">New shared menu</label>
                <input name="menu_name" placeholder="e.g., Happy Hour Drinks" required className={inputCls} />
              </div>
              <SubmitButton formAction={createOrganizationMenu.bind(null, orgId)} className={btnPrimary + ' shrink-0'} pendingLabel="Adding...">
                Add shared menu
              </SubmitButton>
            </form>
          ) : null}

          {organizationMenuList.length ? (
            <div className="flex flex-col gap-6">
              {organizationMenuList.map((menu) => {
                const menuPublished = (menu.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
                const menuStatusColor = menuPublished
                  ? 'bg-success-light text-success'
                  : 'bg-warning-light text-warning';
                const menuFormId = `org-menu-save-${menu.id}`;
                const publishFormId = `org-menu-publish-${menu.id}`;
                const deleteFormId = `org-menu-delete-${menu.id}`;
                const syncFormId = `org-menu-sync-${menu.id}`;

                return (
                  <div key={menu.id} className="rounded-lg border border-border bg-background">
                    {canManageOrganizationMenus ? (
                      <>
                        <form id={menuFormId} action={saveOrganizationMenu.bind(null, orgId)} />
                        <form id={publishFormId}>
                          <input type="hidden" name="menu_id" value={menu.id} />
                        </form>
                        <form id={deleteFormId}>
                          <input type="hidden" name="menu_id" value={menu.id} />
                        </form>
                        <form id={syncFormId}>
                          <input type="hidden" name="menu_id" value={menu.id} />
                        </form>
                        <input form={menuFormId} type="hidden" name="menu_id" value={menu.id} />
                      </>
                    ) : null}

                    <div className="p-5 border-b border-border">
                      {canManageOrganizationMenus ? (
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              form={menuFormId}
                              name="menu_name"
                              defaultValue={menu.name}
                              required
                              className={inputCls + ' sm:max-w-xs'}
                            />
                            <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                              <input
                                form={menuFormId}
                                type="checkbox"
                                name="menu_is_active"
                                defaultChecked={menu.is_active}
                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                              />
                              Active
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${menuStatusColor}`}>
                              {menuPublished ? 'Published' : 'Draft'}
                            </span>
                            <SubmitButton type="submit" form={menuFormId} className={btnSecondary} pendingLabel="Saving...">
                              Save
                            </SubmitButton>
                            <SubmitButton
                              className={btnSecondary}
                              form={syncFormId}
                              formAction={syncOrganizationMenuToVenues.bind(null, orgId)}
                              pendingLabel="Syncing..."
                            >
                              Sync copies
                            </SubmitButton>
                            {menuPublished ? (
                              <SubmitButton
                                className={btnPrimary}
                                form={publishFormId}
                                formAction={unpublishOrganizationMenu.bind(null, orgId)}
                                pendingLabel="Updating..."
                              >
                                Unpublish
                              </SubmitButton>
                            ) : (
                              <SubmitButton
                                className={btnPrimary}
                                form={publishFormId}
                                formAction={publishOrganizationMenu.bind(null, orgId)}
                                pendingLabel="Publishing..."
                              >
                                Publish
                              </SubmitButton>
                            )}
                            <SubmitButton
                              className={btnDanger}
                              form={deleteFormId}
                              formAction={deleteOrganizationMenu.bind(null, orgId)}
                              formNoValidate
                              pendingLabel="Deleting..."
                            >
                              Delete
                            </SubmitButton>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <h3 className="text-body-md font-semibold text-foreground">{menu.name}</h3>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${menuStatusColor}`}>
                            {menuPublished ? 'Published' : 'Draft'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      {canManageOrganizationMenus ? (
                        <form className="flex flex-col gap-3 sm:flex-row sm:items-end mb-5">
                          <input type="hidden" name="menu_id" value={menu.id} />
                          <div className="flex-1">
                            <label className="text-caption font-medium text-muted block mb-1">New section</label>
                            <input name="section_name" placeholder="e.g., Cocktails" required className={inputCls} />
                          </div>
                          <SubmitButton
                            className={btnSecondary + ' shrink-0'}
                            formAction={createOrganizationMenuSection.bind(null, orgId)}
                            pendingLabel="Adding..."
                          >
                            Add section
                          </SubmitButton>
                        </form>
                      ) : null}

                      {(menu.menu_sections ?? []).length ? (
                        <div className="flex flex-col gap-5">
                          {(menu.menu_sections ?? []).map((section) => {
                            const deleteSectionFormId = `org-section-delete-${section.id}`;

                            return (
                              <div key={section.id} className="rounded-md border border-border bg-surface p-4">
                                {canManageOrganizationMenus ? (
                                  <form id={deleteSectionFormId}>
                                    <input type="hidden" name="section_id" value={section.id} />
                                  </form>
                                ) : null}

                                {canManageOrganizationMenus ? (
                                  <div className="flex items-center gap-3 mb-4">
                                    <input form={menuFormId} type="hidden" name="section_ids" value={section.id} />
                                    <input
                                      form={menuFormId}
                                      name={`section_name_${section.id}`}
                                      defaultValue={section.name}
                                      required
                                      className={inputCls + ' flex-1'}
                                    />
                                    <SubmitButton
                                      className={btnDanger}
                                      form={deleteSectionFormId}
                                      formAction={deleteOrganizationMenuSection.bind(null, orgId)}
                                      formNoValidate
                                      pendingLabel="Deleting..."
                                    >
                                      Delete section
                                    </SubmitButton>
                                  </div>
                                ) : (
                                  <h4 className="text-body-sm font-semibold text-foreground mb-4">{section.name}</h4>
                                )}

                                {(section.menu_items ?? []).length ? (
                                  <div className="flex flex-col gap-3">
                                    {(section.menu_items ?? []).map((item) => {
                                      const deleteItemFormId = `org-item-delete-${item.id}`;

                                      return (
                                        <div key={item.id} className="rounded-md border border-border bg-background p-4">
                                          {canManageOrganizationMenus ? (
                                            <form id={deleteItemFormId}>
                                              <input type="hidden" name="item_id" value={item.id} />
                                            </form>
                                          ) : null}
                                          {canManageOrganizationMenus ? (
                                            <div className="flex flex-col gap-3">
                                              <input form={menuFormId} type="hidden" name="item_ids" value={item.id} />
                                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                                                <input
                                                  form={menuFormId}
                                                  name={`item_name_${item.id}`}
                                                  defaultValue={item.name}
                                                  required
                                                  className={inputCls}
                                                />
                                                <input
                                                  form={menuFormId}
                                                  name={`item_price_${item.id}`}
                                                  type="number"
                                                  step="0.01"
                                                  defaultValue={item.price ?? ''}
                                                  placeholder="Price"
                                                  className={inputCls}
                                                />
                                              </div>
                                              <textarea
                                                form={menuFormId}
                                                name={`item_description_${item.id}`}
                                                defaultValue={item.description ?? ''}
                                                placeholder="Description (optional)"
                                                rows={2}
                                                className={inputCls + ' h-auto py-2'}
                                              />
                                              <div className="flex items-center justify-between gap-3">
                                                <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                                  <input
                                                    form={menuFormId}
                                                    type="checkbox"
                                                    name={`item_is_happy_hour_${item.id}`}
                                                    defaultChecked={!!item.is_happy_hour}
                                                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                                  />
                                                  Happy hour item
                                                </label>
                                                <SubmitButton
                                                  className={btnDanger}
                                                  form={deleteItemFormId}
                                                  formAction={deleteOrganizationMenuItem.bind(null, orgId)}
                                                  formNoValidate
                                                  pendingLabel="Deleting..."
                                                >
                                                  Delete item
                                                </SubmitButton>
                                              </div>
                                            </div>
                                          ) : (
                                            <div>
                                              <div className="flex items-center justify-between">
                                                <h5 className="text-body-sm font-semibold text-foreground">{item.name}</h5>
                                                {item.price != null ? (
                                                  <span className="text-body-sm font-medium text-foreground">${Number(item.price).toFixed(2)}</span>
                                                ) : null}
                                              </div>
                                              <p className="text-caption text-muted mt-0.5">{item.description ?? 'No description'}</p>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-caption text-muted text-center py-2">No items yet.</p>
                                )}

                                {canManageOrganizationMenus ? (
                                  <MenuSectionItemAdder
                                    sectionId={section.id}
                                    createItemAction={createOrganizationMenuItem.bind(null, orgId)}
                                    addButtonClassName={btnSecondary}
                                    okButtonClassName={btnSecondary}
                                    deleteButtonClassName={btnDanger}
                                    inputClassName={inputCls}
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-caption text-muted">No sections yet. Add one above.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <p className="text-body-sm font-medium text-foreground">No organization menus yet</p>
              <p className="text-body-sm text-muted mt-1">Create a shared menu here, then import it into any venue.</p>
            </div>
          )}
        </div>

        {/* Venues List */}
        <div>
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Venues</h2>

          {venuesErr ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3">
              <p className="text-body-sm font-medium text-error">Database error</p>
              <p className="text-body-sm text-error/80 mt-0.5">{venuesErr.message}</p>
            </div>
          ) : null}

          {(venues as VenueRow[] | null)?.length ? (
            <div className="flex flex-col gap-3">
              {(venues as VenueRow[]).map((v) => {
                const displayName = v.org_name?.trim() || v.name;
                const locationLabel = v.org_name?.trim() && v.org_name !== v.name ? v.name : null;
                const venueHref = fromAdmin
                  ? `/orgs/${orgId}/venues/${v.id}?from=admin`
                  : `/orgs/${orgId}/venues/${v.id}`;
                const statusColor = v.status === 'published'
                  ? 'bg-success-light text-success'
                  : v.status === 'draft'
                    ? 'bg-warning-light text-warning'
                    : 'bg-background text-muted';

                return (
                  <div
                    key={v.id}
                    className="rounded-lg border border-border bg-surface shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-heading-sm font-bold text-brand-dark">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-body-md font-semibold text-foreground">{displayName}</h3>
                          {locationLabel ? (
                            <p className="text-caption text-muted">{locationLabel}</p>
                          ) : null}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-body-sm text-muted">
                              {(v.city || v.state) ? `${v.city ?? ''}${v.city && v.state ? ', ' : ''}${v.state ?? ''}` : '—'}
                            </span>
                            {v.status ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${statusColor}`}>
                                {v.status}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={venueHref}>
                          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer">
                            Manage
                          </span>
                        </Link>
                        {isOwner ? (
                          <form>
                            <input type="hidden" name="venue_id" value={v.id} />
                            <button
                              formAction={deleteVenue.bind(null, orgId)}
                              className="inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
              <div className="text-muted-light text-display-md mb-3">&#127866;</div>
              <p className="text-body-sm font-medium text-foreground">No venues yet</p>
              <p className="text-body-sm text-muted mt-1">
                Add your first venue above to start managing Happy Hours.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
