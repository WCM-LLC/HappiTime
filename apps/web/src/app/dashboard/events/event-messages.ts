// Copy for the Tastemaker events pages. Error keys are the codes
// utils/tastemakerEvent.mjs and the server action redirect with.

export const EVENT_NOTICE: Record<string, string> = {
  submitted: 'Sent for review. The venue (or HappiTime staff, if the venue has no owner on the platform yet) will approve it, and it goes live the moment they do.',
  published: 'Published.',
};

export const EVENT_ERRORS: Record<string, string> = {
  venue_required: 'Pick the venue this event is at.',
  venue_not_published: 'That venue is not a published listing yet, so an event can’t be attached to it.',
  title_required: 'Give the event a title.',
  title_too_long: 'Keep the title under 120 characters.',
  description_too_long: 'Keep the description under 2,000 characters.',
  event_type_invalid: 'Pick an event type from the list.',
  date_required: 'Pick the date (or mark it as weekly and choose the days).',
  date_in_past: 'That date has already passed.',
  weekday_required: 'A weekly event needs at least one day of the week.',
  start_time_required: 'Enter a start time.',
  end_time_invalid: 'The end time isn’t a valid time.',
  price_info_too_long: 'Keep the price line short — under 80 characters.',
  external_url_invalid: 'The link has to start with https:// (or http://).',
  unschedulable: 'That date and time couldn’t be placed on the calendar. Check them and try again.',
  save_failed: 'Something went wrong saving the event. Nothing was submitted — try again.',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  event: 'Event',
  special: 'Special',
  live_music: 'Live music',
  trivia: 'Trivia',
  sports: 'Sports / watch party',
  other: 'Other',
};

export const DOW = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];
