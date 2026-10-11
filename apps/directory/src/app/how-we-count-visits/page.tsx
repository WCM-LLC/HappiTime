import type { Metadata } from "next";
import { PageTracker } from "@/components/PageTracker";

/**
 * HOW WE COUNT A VISIT — the plain-English attribution method.
 *
 * Replaces the old pricing-FAQ answer "How we measure it is our recipe". The
 * sharpest venue objection is "will this actually put people on my stools?",
 * and declining to say how we count is not an answer to it.
 *
 * Everything here describes what the product does today (track-visit scan
 * events, the daily staff code + location check in verify-checkin, first-visit
 * marking, the console scan log and check-in export). If the measurement
 * changes, change this page in the same PR — it is a promise to venue owners.
 */
export const metadata: Metadata = {
  title: "How HappiTime Counts a Visit",
  description:
    "Exactly what HappiTime counts for Kansas City bars and restaurants — listing views, QR scans, and check-ins confirmed with a daily staff code — and what we do not claim.",
  alternates: { canonical: "/how-we-count-visits/" },
  openGraph: {
    title: "How HappiTime Counts a Visit",
    description:
      "What we count for venues, what we do not, and how to check the numbers yourself.",
    url: "https://happitime.biz/how-we-count-visits/",
  },
};

const DISPLAY = "heading-sans font-extrabold tracking-[-0.02em] leading-[1.15]";

const SIGNALS = [
  {
    kicker: "1 · Someone looked",
    title: "Listing views and clicks",
    body: [
      "Each time your listing is opened on happitime.biz or in the app, that is a view. A tap from a list or the map through to your page is a click.",
      "This tells you people are finding you. It does not prove anyone walked in, and we never report it as if it did.",
    ],
  },
  {
    kicker: "2 · Someone scanned",
    title: "QR scans at your bar",
    body: [
      "The HappiTime QR code on your coaster, table tent or window sticker belongs to your venue only. When a phone scans it, we count a scan.",
      "Repeat scans from the same sitting are filtered out, so the number cannot be padded — by a regular, or by you. Scans are anonymous: we count the scan, not the person.",
    ],
  },
  {
    kicker: "3 · Someone was there",
    title: "Check-ins with the day’s staff code",
    body: [
      "This is the number that matters. Your staff page shows a short code that changes every morning. A guest types it into the HappiTime app while they are in your building, and the app checks the phone’s location against your address.",
      "Right code, right place: one check-in. Your own staff are left out of the count. The first time a person checks in with you we mark them a first-timer; after that they are a regular. You see both.",
    ],
  },
];

export default function HowWeCountVisitsPage() {
  return (
    <>
      <PageTracker pagePath="/how-we-count-visits/" />
      <article className="mx-auto max-w-[var(--width-narrow)] px-6 py-14 md:py-20">
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-brand-dark-alt">
          For KC bars &amp; restaurants
        </p>
        <h1 className={`${DISPLAY} mb-5 text-balance text-[clamp(2rem,5vw,3rem)]`}>
          How we count a visit.
        </h1>
        <p className="mb-4 text-pretty text-[18px] text-muted">
          The fair question from every owner is the same one: will this actually put people on my
          stools? You should not have to take our word for it. Here is exactly what we count, what
          we do not, and how to check the numbers yourself.
        </p>

        <div className="mt-10 flex flex-col gap-5">
          {SIGNALS.map((s) => (
            <section
              key={s.title}
              className="rounded-lg border border-border bg-surface p-6 shadow-md md:p-7"
            >
              <p className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted-light">
                {s.kicker}
              </p>
              <h2 className={`${DISPLAY} mb-3 text-[22px]`}>{s.title}</h2>
              {s.body.map((para) => (
                <p key={para} className="mb-2.5 text-pretty text-[15.5px] text-muted last:mb-0">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        <section className="mt-12">
          <h2 className={`${DISPLAY} mb-3 text-[24px]`}>Which nights</h2>
          <p className="text-pretty text-[15.5px] text-muted">
            Every scan and every check-in carries its date, so your report adds them up night by
            night. That is where &ldquo;your best HappiTime night&rdquo; comes from — it is a
            count, not a guess.
          </p>
        </section>

        <section className="mt-10">
          <h2 className={`${DISPLAY} mb-3 text-[24px]`}>What we do not claim</h2>
          <ul className="list-disc space-y-2.5 pl-5 text-pretty text-[15.5px] text-muted">
            <li>
              We do not say a specific post or a specific coaster made a specific person walk in.
              Nobody can honestly tell you that.
            </li>
            <li>We do not count an app download as a visit.</li>
            <li>
              We do not estimate or round up. If a row says 40, forty of that thing happened.
            </li>
            <li>
              We keep views, scans and check-ins on separate rows. A view is never dressed up as a
              person through the door.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className={`${DISPLAY} mb-3 text-[24px]`}>Check it yourself</h2>
          <p className="text-pretty text-[15.5px] text-muted">
            You do not have to wait for the monthly report. Your venue console shows scans and
            check-ins as they come in, and you can download your check-ins as a spreadsheet and
            hold them up against your own slow nights.
          </p>
        </section>

        <section className="mt-12 rounded-xl bg-brand-subtle px-7 py-8 text-center">
          <h2 className={`${DISPLAY} mb-2 text-[24px]`}>See it on your own bar.</h2>
          <p className="mx-auto mb-6 max-w-[460px] text-pretty text-[15px] text-muted">
            Featured is free for 30 days — $0 today, cancel anytime. The attribution report comes
            with it.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <a
              href="/pricing/"
              className="inline-block rounded-full bg-dark px-[30px] py-3.5 text-[15px] font-bold text-white transition-all duration-normal ease-default hover:-translate-y-px hover:bg-black"
            >
              See plans — from free
            </a>
            <a
              href="/contactus/"
              className="inline-block rounded-full border-[1.5px] border-border-strong px-[30px] py-3.5 text-[15px] font-bold text-foreground transition-all duration-normal ease-default hover:border-foreground"
            >
              Ask us a question
            </a>
          </div>
        </section>
      </article>
    </>
  );
}
