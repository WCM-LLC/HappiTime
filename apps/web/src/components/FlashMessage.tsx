'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

const SUCCESS_LABELS: Record<string, string> = {
  venue_saved: 'Venue details saved',
  reward_saved: 'Reward updated',
  venue_published: 'Venue published',
  venue_unpublished: 'Venue unpublished',
  settings_saved: 'Settings saved',
  hh_created: 'Happy hour window created',
  hh_saved: 'Happy hour window saved',
  hh_deleted: 'Happy hour window deleted',
  hh_published: 'Happy hour window published',
  hh_unpublished: 'Happy hour window unpublished',
  hh_menus_saved: 'Happy hour menus updated',
  menu_created: 'Menu created',
  menu_saved: 'Menu saved',
  menu_deleted: 'Menu deleted',
  menu_published: 'Menu published',
  menu_unpublished: 'Menu unpublished',
  organization_menu_created: 'Organization menu created',
  organization_menu_saved: 'Organization menu saved',
  organization_menu_deleted: 'Organization menu deleted',
  organization_menu_published: 'Organization menu published',
  organization_menu_unpublished: 'Organization menu unpublished',
  organization_menu_imported: 'Organization menu added to venue',
  organization_menu_synced: 'Organization menu copies synced',
  published_menu_imported: 'Published menu copied to venue',
  section_created: 'Section created',
  section_deleted: 'Section deleted',
  item_created: 'Item created',
  item_deleted: 'Item deleted',
  event_created: 'Event created',
  event_saved: 'Event saved',
  event_deleted: 'Event deleted',
  event_published: 'Event published',
  event_unpublished: 'Event unpublished',
  tags_saved: 'Tags saved',
  staff_added: 'Staff member added',
  staff_removed: 'Staff member removed',
};

export function FlashMessage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const success = searchParams.get('success');

  useEffect(() => {
    if (!success) return;

    const label = SUCCESS_LABELS[success] ?? 'Saved';
    toast.success(label);

    // Remove ?success= from the URL without adding a history entry
    const params = new URLSearchParams(searchParams.toString());
    params.delete('success');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [success]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
