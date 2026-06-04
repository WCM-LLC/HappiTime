import { SubmitButton } from '@/components/ui/SubmitButton';
import MenuSectionItemAdder from '@/components/MenuSectionItemAdder';

/**
 * VenueMenusManager — the full venue-scoped menu editor (create, import from an
 * organization or another venue, edit sections & items, publish/unpublish,
 * delete). It is a plain server component, so the per-venue server actions are
 * passed in already bound to `(orgId, venueId)` — no client serialization is
 * involved; the only client boundaries are SubmitButton and MenuSectionItemAdder.
 *
 * Rendered both on the per-venue page and, grouped by venue, on the org
 * dashboard's Menus tab. The org tab passes `redirectTo="/orgs/{orgId}"` so a
 * save lands back on that tab instead of bouncing to the venue page; the venue
 * page omits it (empty string falls through to the venue page server-side).
 */

const HH_STATUS_PUBLISHED = 'published';

export type VMM_MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_happy_hour?: boolean;
  sort_order: number;
};

export type VMM_MenuSection = {
  id: string;
  name: string;
  sort_order: number;
  menu_items: VMM_MenuItem[] | null;
};

export type VMM_Menu = {
  id: string;
  name: string;
  status?: string;
  is_active: boolean;
  source_menu_id: string | null;
  menu_sections: VMM_MenuSection[] | null;
};

export type VMM_OrgMenuOption = {
  id: string;
  name: string;
  status?: string;
  is_active: boolean;
};

export type VMM_PublishedVenueMenuOption = {
  id: string;
  name: string;
  venue_id: string | null;
  venue: {
    id: string;
    name: string;
    org_name: string | null;
  } | null;
};

type ActionFn = (formData: FormData) => void | Promise<void>;

export type VenueMenusManagerProps = {
  title?: string;
  description?: string;
  menus: VMM_Menu[];
  organizationMenuList: VMM_OrgMenuOption[];
  publishedVenueMenus: VMM_PublishedVenueMenuOption[];
  importedOrganizationMenuIds: Set<string>;
  canManageVenue: boolean;
  canEditMenuItems: boolean;
  /** Caller-supplied return path; '' (default) falls back to the venue page. */
  redirectTo?: string;
  classNames: {
    input: string;
    select: string;
    btnPrimary: string;
    btnSecondary: string;
    btnDanger: string;
  };
  actions: {
    createMenu: ActionFn;
    importOrganizationMenu: ActionFn;
    importPublishedVenueMenu: ActionFn;
    saveMenu: ActionFn;
    publishMenu: ActionFn;
    unpublishMenu: ActionFn;
    deleteMenu: ActionFn;
    createSection: ActionFn;
    deleteSection: ActionFn;
    createItem: ActionFn;
    deleteItem: ActionFn;
  };
};

export default function VenueMenusManager({
  title = 'Menus',
  description = 'Structured menus with sections and items.',
  menus,
  organizationMenuList,
  publishedVenueMenus,
  importedOrganizationMenuIds,
  canManageVenue,
  canEditMenuItems,
  redirectTo,
  classNames,
  actions,
}: VenueMenusManagerProps) {
  const { input: inputCls, select: selectCls, btnPrimary, btnSecondary, btnDanger } = classNames;
  const rt = redirectTo ?? '';

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-heading-sm font-semibold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted mt-0.5">{description}</p>
        </div>
      </div>

      {/* Create menu */}
      {canManageVenue ? (
        <form className="flex gap-3 items-end mb-6">
          <input type="hidden" name="redirect_to" value={rt} />
          <div className="flex-1">
            <label className="text-body-sm font-medium text-foreground block mb-1.5">New menu</label>
            <input name="menu_name" placeholder="e.g., Happy Hour Drinks" required className={inputCls} />
          </div>
          <SubmitButton formAction={actions.createMenu} className={btnPrimary + ' shrink-0'} pendingLabel="Adding…">
            Add menu
          </SubmitButton>
        </form>
      ) : null}

      {canManageVenue && organizationMenuList.length ? (
        <form className="rounded-md border border-border bg-background/50 p-4 mb-6">
          <input type="hidden" name="redirect_to" value={rt} />
          <label className="text-body-sm font-medium text-foreground block mb-1.5">
            Add from organization menus
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select name="organization_menu_id" required className={selectCls + ' flex-1'}>
              <option value="">Choose a shared menu</option>
              {organizationMenuList.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                  {importedOrganizationMenuIds.has(menu.id) ? ' (refresh existing copy)' : ''}
                </option>
              ))}
            </select>
            <SubmitButton
              formAction={actions.importOrganizationMenu}
              className={btnSecondary + ' shrink-0'}
              pendingLabel="Importing..."
            >
              Add to venue
            </SubmitButton>
          </div>
          <p className="text-caption text-muted mt-2">
            The imported menu becomes this venue&apos;s editable copy. Organization-level changes can be synced back to linked copies.
          </p>
        </form>
      ) : null}

      {canManageVenue && publishedVenueMenus.length ? (
        <form className="rounded-md border border-border bg-background/50 p-4 mb-6">
          <input type="hidden" name="redirect_to" value={rt} />
          <label className="text-body-sm font-medium text-foreground block mb-1.5">
            Copy a published menu from another venue
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select name="source_menu_id" required className={selectCls + ' flex-1'}>
              <option value="">Choose a published menu</option>
              {publishedVenueMenus.map((menu) => {
                const sourceVenueName = menu.venue?.org_name?.trim() || menu.venue?.name || 'Other venue';
                const sourceLocationName =
                  menu.venue?.org_name?.trim() && menu.venue?.name && menu.venue.org_name !== menu.venue.name
                    ? ` (${menu.venue.name})`
                    : '';

                return (
                  <option key={menu.id} value={menu.id}>
                    {sourceVenueName}
                    {sourceLocationName} - {menu.name}
                  </option>
                );
              })}
            </select>
            <SubmitButton
              formAction={actions.importPublishedVenueMenu}
              className={btnSecondary + ' shrink-0'}
              pendingLabel="Copying..."
            >
              Copy to venue
            </SubmitButton>
          </div>
          <p className="text-caption text-muted mt-2">
            This creates an independent draft copy. Future edits to the source menu will not sync here.
          </p>
        </form>
      ) : null}

      {menus.length ? (
        <div className="flex flex-col gap-6">
          {menus.map((m) => {
            const menuPublished = (m.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED;
            const menuStatusColor = menuPublished
              ? 'bg-success-light text-success'
              : 'bg-warning-light text-warning';
            const menuFormId = `menu-save-form-${m.id}`;
            const publishMenuFormId = `menu-publish-form-${m.id}`;
            const deleteMenuFormId = `menu-delete-form-${m.id}`;

            return (
              <div key={m.id} className="rounded-lg border border-border bg-background">
                {canEditMenuItems ? (
                  <form id={menuFormId} action={actions.saveMenu} />
                ) : null}
                {canManageVenue ? (
                  <>
                    <form id={publishMenuFormId}>
                      <input type="hidden" name="menu_id" value={m.id} />
                      <input type="hidden" name="redirect_to" value={rt} />
                    </form>
                    <form id={deleteMenuFormId}>
                      <input type="hidden" name="menu_id" value={m.id} />
                      <input type="hidden" name="redirect_to" value={rt} />
                    </form>
                  </>
                ) : null}

                {/* ── Menu header ── */}
                <div className="p-5 border-b border-border">
                  {canEditMenuItems ? (
                    <>
                      <input form={menuFormId} type="hidden" name="menu_id" value={m.id} />
                      <input form={menuFormId} type="hidden" name="redirect_to" value={rt} />
                    </>
                  ) : null}
                  {canManageVenue ? (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex flex-col gap-1 sm:max-w-xs sm:flex-1">
                          <input
                            form={menuFormId}
                            name="menu_name"
                            defaultValue={m.name}
                            required
                            className={inputCls}
                          />
                          {m.source_menu_id ? (
                            <span className="text-caption text-muted">Linked to an organization menu</span>
                          ) : null}
                        </div>
                        <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                          <input
                            form={menuFormId}
                            type="checkbox"
                            name="menu_is_active"
                            defaultChecked={m.is_active}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          Active
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${menuStatusColor}`}>
                          {menuPublished ? 'Published' : 'Draft'}
                        </span>
                        <SubmitButton type="submit" form={menuFormId} className={btnSecondary} pendingLabel="Saving…">
                          Save menu
                        </SubmitButton>
                        {menuPublished ? (
                          <SubmitButton
                            className={btnPrimary}
                            form={publishMenuFormId}
                            formAction={actions.unpublishMenu}
                            pendingLabel="Updating…"
                          >
                            Unpublish menu
                          </SubmitButton>
                        ) : (
                          <SubmitButton
                            className={btnPrimary}
                            form={publishMenuFormId}
                            formAction={actions.publishMenu}
                            pendingLabel="Publishing…"
                          >
                            Publish menu
                          </SubmitButton>
                        )}
                        <SubmitButton
                          className={btnDanger}
                          form={deleteMenuFormId}
                          formAction={actions.deleteMenu}
                          formNoValidate
                          pendingLabel="Deleting…"
                        >
                          Delete menu
                        </SubmitButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-body-md font-semibold text-foreground">{m.name}</h3>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-1 ${menuStatusColor}`}>
                          {menuPublished ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      {canEditMenuItems ? (
                        <SubmitButton type="submit" form={menuFormId} className={btnSecondary} pendingLabel="Saving…">
                          Save menu
                        </SubmitButton>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* ── Sections ── */}
                <div className="p-5">
                  {/* Add section */}
                  {canManageVenue ? (
                    <form className="flex gap-3 items-end mb-5">
                      <input type="hidden" name="menu_id" value={m.id} />
                      <input type="hidden" name="redirect_to" value={rt} />
                      <div className="flex-1">
                        <label className="text-caption font-medium text-muted block mb-1">New menu section</label>
                        <input name="section_name" placeholder="e.g., Cocktails" required className={inputCls} />
                      </div>
                      <button className={btnSecondary + ' shrink-0'} formAction={actions.createSection}>
                        Add menu section
                      </button>
                    </form>
                  ) : null}

                  {(m.menu_sections ?? []).length ? (
                    <div className="flex flex-col gap-5">
                      {(m.menu_sections ?? []).map((s) => {
                        const deleteSectionFormId = `section-delete-form-${s.id}`;

                        return (
                          <div key={s.id} className="rounded-md border border-border bg-surface p-4">
                            {canManageVenue ? (
                              <form id={deleteSectionFormId}>
                                <input type="hidden" name="section_id" value={s.id} />
                                <input type="hidden" name="redirect_to" value={rt} />
                              </form>
                            ) : null}

                            {/* Section header */}
                            {canManageVenue ? (
                              <div className="flex items-center gap-3 mb-4">
                                <input form={menuFormId} type="hidden" name="section_ids" value={s.id} />
                                <input
                                  form={menuFormId}
                                  name={`section_name_${s.id}`}
                                  defaultValue={s.name}
                                  required
                                  className={inputCls + ' flex-1'}
                                />
                                <button
                                  className={btnDanger}
                                  form={deleteSectionFormId}
                                  formAction={actions.deleteSection}
                                  formNoValidate
                                >
                                  Delete menu section
                                </button>
                              </div>
                            ) : (
                              <h4 className="text-body-sm font-semibold text-foreground mb-4">{s.name}</h4>
                            )}

                            {canEditMenuItems ? null : (
                              <p className="text-caption text-muted mb-4">Menu items are read-only for your role.</p>
                            )}

                            {/* Item list */}
                            {(s.menu_items ?? []).length ? (
                              <div className="flex flex-col gap-3">
                                {(s.menu_items ?? []).map((it) => {
                                  const deleteItemFormId = `item-delete-form-${it.id}`;

                                  return (
                                    <div key={it.id} className="rounded-md border border-border bg-background p-4">
                                      {canEditMenuItems ? (
                                        <form id={deleteItemFormId}>
                                          <input type="hidden" name="item_id" value={it.id} />
                                          <input type="hidden" name="redirect_to" value={rt} />
                                        </form>
                                      ) : null}
                                      {canEditMenuItems ? (
                                        <div className="flex flex-col gap-3">
                                          <input form={menuFormId} type="hidden" name="item_ids" value={it.id} />
                                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                                            <input
                                              form={menuFormId}
                                              name={`item_name_${it.id}`}
                                              defaultValue={it.name}
                                              required
                                              className={inputCls}
                                            />
                                            <input
                                              form={menuFormId}
                                              name={`item_price_${it.id}`}
                                              type="number"
                                              step="0.01"
                                              defaultValue={it.price ?? ''}
                                              placeholder="Price"
                                              className={inputCls}
                                            />
                                          </div>
                                          <textarea
                                            form={menuFormId}
                                            name={`item_description_${it.id}`}
                                            defaultValue={it.description ?? ''}
                                            placeholder="Description (optional)"
                                            rows={2}
                                            className={inputCls + ' h-auto py-2'}
                                          />
                                          <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
                                              <input
                                                form={menuFormId}
                                                type="checkbox"
                                                name={`item_is_happy_hour_${it.id}`}
                                                defaultChecked={!!it.is_happy_hour}
                                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                              />
                                              Happy hour item
                                            </label>
                                            <div className="flex items-center gap-2">
                                              <button
                                                className={btnDanger}
                                                form={deleteItemFormId}
                                                formAction={actions.deleteItem}
                                                formNoValidate
                                              >
                                                Delete section item
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-body-sm font-semibold text-foreground">{it.name}</h5>
                                            {it.price != null ? (
                                              <span className="text-body-sm font-medium text-foreground">${Number(it.price).toFixed(2)}</span>
                                            ) : null}
                                          </div>
                                          <p className="text-caption text-muted mt-0.5">{it.description ?? 'No description'}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-caption text-muted text-center py-2">No items yet.</p>
                            )}
                            {canEditMenuItems ? (
                              <MenuSectionItemAdder
                                sectionId={s.id}
                                createItemAction={actions.createItem}
                                addButtonClassName={btnSecondary}
                                okButtonClassName={btnSecondary}
                                deleteButtonClassName={btnDanger}
                                inputClassName={inputCls}
                                redirectTo={redirectTo}
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
          <div className="text-muted-light text-display-md mb-2">&#127860;</div>
          <p className="text-body-sm font-medium text-foreground">No menus yet</p>
          <p className="text-body-sm text-muted mt-1">Create your first menu above to start building.</p>
        </div>
      )}
    </div>
  );
}
