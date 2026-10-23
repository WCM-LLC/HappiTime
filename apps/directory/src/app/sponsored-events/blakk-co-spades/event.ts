// Spades at The Blakk Co. — the Inaugural tournament. Thursday November 5, 2026.
// Everything editable about the event lives here; the page, the form and the
// confirmation copy all read from this file.
//
// Payments are collected by The Blakk Co. (their embed / link), not HappiTime.
// Prize money comes back to HappiTime and is paid to winners within 24–48 hours.

export const EVENT = {
  slug: "blakk-co-spades",
  title: "Spades Night",
  subtitle: "at The Blakk Co.",
  tagline: "The Inaugural tournament · 12 teams, double elimination",
  /** ISO timestamps with Central offset (CST — DST ends November 1). */
  starts: "2026-11-05T18:00:00-06:00",
  ends: "2026-11-05T23:00:00-06:00",
  /** Registration closes at the end of Tuesday, November 3 (Central). */
  registrationCloses: "2026-11-04T00:00:00-06:00",
  closesLabel: "Tuesday, November 3",
  closesShort: "November 3",
  dateLabel: "Thursday, November 5",
  dateLong: "Thursday, November 5, 2026",
  dayNumber: "5",
  monthShort: "Nov",
  /** TODO(J): confirm doors / first deal with The Blakk Co. */
  doors: "6:00 PM",
  firstDeal: "7:00 PM",
  venue: "The Blakk Co.",
  venueShort: "Blakk Co.",
  /** Slug of the venue row in HappiTime; the door check-in QR is happitime.biz/v/{venueSlug}. */
  venueSlug: "the-blakk-co",
  address: "1108 E 30th St, Suite BB, Kansas City, MO 64109",
  area: "Midtown",
  mapsUrl:
    "https://maps.google.com/?q=" +
    encodeURIComponent("The Blakk Co., 1108 E 30th St Suite BB, Kansas City, MO"),
  venueSite: "https://theblakkco.com/",

  /** Per-player entry. Members of The Blakk Co. vs everyone else. */
  fee: { member: 10, nonMember: 20 },
  /** Spectators: members free; non-members once the bracket is full. */
  spectator: { member: 0, nonMember: 20 },

  /** 12 teams, double elimination. */
  teamCap: 12,
  tables: 6,
  formatLabel: "12-team double elimination",
  ageMin: 21,
  sponsors: ["HappiTime", "The Blakk Co."],

  /**
   * Every team's entry puts $14 into the prize pool, member or not (HappiTime
   * receives $20 per team; 30% is kept, 70% goes to the pool). Split 60/30/10.
   */
  prize: {
    perTeam: 14,
    split: [
      { place: "1st", pct: 60 },
      { place: "2nd", pct: 30 },
      { place: "3rd", pct: 10 },
    ],
    payoutWindow: "24–48 hours",
  },

  /**
   * Where players pay. The Blakk Co. manages all payments; paste the embed /
   * checkout URL they provide here. While it's empty the confirmation screen
   * tells players to watch for a payment link by text instead.
   */
  pay: {
    url: "",
    label: "Pay The Blakk Co.",
  },

  /** Shown under "Questions?". Either may be empty. */
  contactPhone: "816-937-2966",
  contactEmail: "admin@happitime.biz",
};

/**
 * Where registrations are sent. Empty = preview mode (nothing is stored and
 * the confirmation screen says so). Set to a Google Apps Script web-app URL
 * (same pattern as tacos-and-tables; make a new sheet tab / deployment for
 * this event — the payload has new columns: member, handle, partner_handle,
 * handle_verified, partner_handle_verified).
 */
export const REGISTRATION_ENDPOINT = "";

export function prizePool(teams: number) {
  const pool = teams * EVENT.prize.perTeam;
  const amounts = EVENT.prize.split.map((s) => Math.round((pool * s.pct) / 100));
  // Rounding: give any leftover dollar to first place so the amounts sum to the pool.
  const diff = pool - amounts.reduce((a, b) => a + b, 0);
  amounts[0] += diff;
  return { pool, amounts };
}

export const RULES: { title: string; body?: string }[] = [
  {
    title: `Registration closes ${EVENT.closesLabel}.`,
    body: `Entry is $${EVENT.fee.member} per player for Blakk Co. members ($${EVENT.fee.member * 2} a team) and $${EVENT.fee.nonMember} per player for everyone else ($${EVENT.fee.nonMember * 2} a team), paid in advance through The Blakk Co. Unpaid registrations are released after ${EVENT.closesShort}.`,
  },
  {
    title: "Every player needs the HappiTime app and an account.",
    body: "Check-in at the door is through the app; that's how the bracket is seeded and how winnings are paid. No app, no play.",
  },
  {
    title: "Card ranking: Big Joker, Little Joker, Ace of Spades, King of Spades.",
    body: "In that order, highest to lowest.",
  },
  {
    title: `Dealing starts promptly at ${EVENT.firstDeal}.`,
    body: "Be checked in and seated at your table before the first deal. A team that isn't seated forfeits its first game.",
  },
  {
    title: "Double elimination.",
    body: `${EVENT.teamCap} teams. Lose once and you drop to the losers' bracket; lose twice and your night at the table is over. The bar is still open.`,
  },
  {
    title: "Games are best of five hands.",
    body: "The Grand Final is best of seven. A hand is one deal of 13 books.",
  },
  {
    title: "Every game has a time limit.",
    body: "If the score is tied when time is called, the final hand is played out and decides the game.",
  },
  {
    title: "Bidding is required on every hand.",
  },
  {
    title: "No nils.",
    body: "Nil and blind nil bids are not allowed.",
  },
  {
    title: "Board bid (4 books) minimum each hand.",
  },
  {
    title: "Total team bids must equal 13.",
    body: "The two teams' bids on a hand add up to 13 books.",
  },
  {
    title: "Sandbags cost you the game.",
    body: "Three sandbags in a single hand, or five total over the game, is an automatic loss.",
  },
  {
    title: "Reneging loses the hand.",
  },
  {
    title: "A misdeal gets one re-deal.",
    body: "Each re-deal after that is a 2-book penalty.",
  },
  {
    title: "Shit talking welcome. Arguments, violence, and disrespect are not.",
    body: "Any unscrupulous behavior ends with team forfeiture.",
  },
  {
    title: "Issues that can't be handled civilly go to the referee.",
    body: "If it still can't be resolved, the referee has sole discretion on the final decision.",
  },
];
