// Tacos & Tables with Good Company — Spades tournament, round two.
// Tuesday October 20, 2026. Everything editable about the event lives here. The
// page, the form and the confirmation copy all read from this file.

export const EVENT = {
  slug: "tacos-and-tables",
  title: "Tacos & Tables",
  subtitle: "with Good Company",
  tagline: "Spades tournament night · round two",
  /** ISO timestamps with Central offset (CDT). */
  starts: "2026-10-20T17:00:00-05:00",
  ends: "2026-10-20T21:00:00-05:00",
  /** Registration closes at the end of Monday, October 19 (Central). */
  registrationCloses: "2026-10-20T00:00:00-05:00",
  closesLabel: "Monday, October 19",
  closesShort: "October 19",
  dateLabel: "Tuesday, October 20",
  dateLong: "Tuesday, October 20, 2026",
  /** Card-corner index and ticket stub. */
  dayNumber: "20",
  monthShort: "Oct",
  doors: "5:00 PM",
  firstDeal: "6:00 PM",
  venue: "In Good Company",
  address: "1518 McGee St, Kansas City, MO 64108",
  area: "Crossroads",
  mapsUrl: "https://maps.google.com/?q=" + encodeURIComponent("In Good Company, 1518 McGee St, Kansas City, MO 64108"),
  entryFee: 20,
  /** In Good Company door cover for non-members, paid at the door to the venue. */
  nonMemberEntry: 5,
  /** 8 teams, single elimination: three rounds, done in about two hours. */
  teamCap: 8,
  tables: 4,
  formatLabel: "8-team single elimination",
  ageMin: 21,
  sponsors: ["HappiTime", "NotCho' Taco", "DJ Stixx"],

  /**
   * Where to send the entry fee. Leave a handle empty to hide it.
   * While all three are empty the page tells players to watch for payment
   * instructions by text instead of showing a handle.
   */
  pay: {
    cashapp: "$HappiTimeKCMO",
    venmo: "",
    zelle: "",
  },

  /** Prize line shown on the page. Empty hides the prize block. */
  prize: "Cash prize for the winning team.",

  /** Shown under "Questions?". Either may be empty. */
  contactPhone: "816-937-2966",
  contactEmail: "admin@happitime.biz",

  appStore: "https://apps.apple.com/us/app/happitime/id6757933269",
  googlePlay: "https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile",
};

/**
 * Where registrations are sent. Empty = preview mode (nothing is stored and
 * the confirmation screen says so). Set to the Google Apps Script web-app URL
 * from My Assistant/outreach/2026-10-16_spades-oct20/ (same deployment as
 * October 13, updated to a new version; the URL does not change).
 */
export const REGISTRATION_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxwnqc49RUdlgyc6TZOtza7MZHXRIHy6FJPwg79dRwLzU0IpmSPgIx8oEY2tdqxKLvA/exec";

/**
 * Signature cocktails, one per suit. Red suits render in card red.
 * `credit` is the line under the menu; empty hides it.
 */
export type Suit = "spade" | "club" | "diamond" | "heart";
export const DRINKS: { name: string; suit: Suit; suitName: string; red: boolean; desc: string; spec: string }[] = [
  {
    name: "Ace of Spades",
    suit: "spade",
    suitName: "Spades",
    red: false,
    desc: "Gin, pomegranate and blue curaçao shaken hard over ice, finished with a cherry.",
    spec: "Gin · pomegranate juice · blue curaçao · lime · maraschino liqueur",
  },
  {
    name: "Clover Club",
    suit: "club",
    suitName: "Clubs",
    red: false,
    desc: "The pre-Prohibition classic: gin, lemon and raspberry, clear and pink, with dry vermouth underneath.",
    spec: "Gin · fresh lemon · rich raspberry syrup · dry vermouth",
  },
  {
    name: "Ruby Diamond",
    suit: "diamond",
    suitName: "Diamonds",
    red: true,
    desc: "Gin split with mezcal, a ruby aperitif, lemon and a splash of blood orange. Smoke, then bitter, then bright.",
    spec: "Gin + mezcal · Cappelletti · lemon · blood orange",
  },
  {
    name: "Have a Heart",
    suit: "heart",
    suitName: "Hearts",
    red: true,
    desc: "London dry gin, Swedish punsch and lime with pomegranate grenadine, served up in a Nick & Nora.",
    spec: "London dry gin · Swedish punsch · fresh lime · pomegranate grenadine",
  },
];
export const DRINKS_CREDIT = "";

export const RULES: { title: string; body?: string }[] = [
  {
    title: `Registration closes ${EVENT.closesLabel}.`,
    body: `Entry is $${EVENT.entryFee} per player, paid in advance; a team of two pays $${EVENT.entryFee * 2}. Non-members of ${EVENT.venue} also pay a $${EVENT.nonMemberEntry} entry at the door.`,
  },
  {
    title: "Card ranking: Big Joker, Little Joker, Ace of Spades, King of Spades.",
    body: "In that order, highest to lowest.",
  },
  {
    title: `Dealing starts promptly at ${EVENT.firstDeal}.`,
    body: "Be checked in and seated at your table before the first deal.",
  },
  {
    title: "Single elimination.",
    body: `${EVENT.teamCap} teams, three rounds. Lose a game and your night at the table is over; the bar is still open.`,
  },
  {
    title: "Every game has a 30-minute limit.",
    body: "If the score is tied when time is called, the final hand is played out and decides the game.",
  },
  {
    title: "Games are best of three hands.",
    body: "The semifinal and the final are best of five hands.",
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
