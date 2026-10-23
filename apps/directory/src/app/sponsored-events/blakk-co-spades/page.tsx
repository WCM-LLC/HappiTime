import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { PageTracker } from "@/components/PageTracker";
import { Register } from "./Register";
import { Spade } from "../tacos-and-tables/Spade";
import { EVENT, RULES, prizePool } from "./event";
import "../tacos-and-tables/tournament.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-tnt",
  display: "swap",
});

const full = prizePool(EVENT.teamCap);

export const metadata: Metadata = {
  title: "Spades Night at The Blakk Co. — The Inaugural Tournament, Nov 5",
  description: `The Inaugural spades tournament at The Blakk Co. in Midtown Kansas City. ${EVENT.dateLabel}: doors ${EVENT.doors}, first deal ${EVENT.firstDeal}. $${EVENT.fee.member} per player for Blakk Co. members, $${EVENT.fee.nonMember} for everyone else. ${EVENT.formatLabel}, cash prizes paid within ${EVENT.prize.payoutWindow}. HappiTime app required to check in. Register by ${EVENT.closesShort}.`,
  alternates: { canonical: `/sponsored-events/${EVENT.slug}/` },
  openGraph: {
    title: "Spades Night at The Blakk Co. — The Inaugural",
    description: `${EVENT.dateLabel} at The Blakk Co., Midtown. Doors ${EVENT.doors}, first deal ${EVENT.firstDeal}. ${EVENT.teamCap} teams, double elimination, cash prizes. Register by ${EVENT.closesShort}.`,
    url: `https://happitime.biz/sponsored-events/${EVENT.slug}/`,
    images: [{ url: `/sponsored-events/${EVENT.slug}/og.jpg`, width: 1200, height: 630 }],
  },
};

const sponsorLine = EVENT.sponsors.join(", ").replace(/, ([^,]*)$/, " and $1");

export default function BlakkCoSpadesPage() {
  return (
    <>
      <PageTracker pagePath={`/sponsored-events/${EVENT.slug}/`} />
      <div className={`tnt ${bricolage.variable}`}>
        <div className="wrap">
          {/* Hero: the playing card */}
          <section className="top" aria-labelledby="title">
            <div className="card">
              <div className="index index-tl" aria-hidden="true">
                <span>{EVENT.dayNumber}</span>
                <Spade />
              </div>
              <div className="index index-br" aria-hidden="true">
                <span>{EVENT.dayNumber}</span>
                <Spade />
              </div>

              <div className="card-body">
                <h1 id="title">
                  {EVENT.title}
                  <small>{EVENT.subtitle}</small>
                </h1>
                <Spade className="pip" />
                <dl className="when">
                  <div>
                    <dt>When</dt>
                    <dd>
                      {EVENT.dateLong}
                      <br />
                      Doors {EVENT.doors}, first deal {EVENT.firstDeal}
                    </dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>
                      {EVENT.venue}
                      <br />
                      <a href={EVENT.mapsUrl} target="_blank" rel="noopener">
                        {EVENT.address}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Entry</dt>
                    <dd>
                      Blakk Co. members ${EVENT.fee.member} a player, everyone else $
                      {EVENT.fee.nonMember}. Members watch free.
                    </dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>
                      {EVENT.formatLabel}, {EVENT.ageMin}+. HappiTime app required to check in.
                    </dd>
                  </div>
                </dl>
                <a className="cta" href="#register">
                  Register your spot
                </a>
                <p className="sponsors">Presented by {sponsorLine}</p>
              </div>
            </div>

            <Register />
          </section>

          {/* The night */}
          <section className="night" aria-labelledby="night-title">
            <h2 id="night-title">How the night runs</h2>
            <div className="cols">
              <div>
                <h3>{EVENT.doors}</h3>
                <p>
                  Doors open. Open the HappiTime app, scan the Blakk Co. code at the door to
                  check in, and find your table. Solo players get paired here. Not a member?
                  City Pass is available at the door.
                </p>
              </div>
              <div>
                <h3>{EVENT.firstDeal}</h3>
                <p>
                  First deal, on the dot, across {EVENT.tables} tables. Double elimination:{" "}
                  {EVENT.teamCap} teams, lose once and you drop to the losers&rsquo; bracket, lose
                  twice and you&rsquo;re out. Games are best of five hands.
                </p>
              </div>
              <div>
                <h3>The Grand Final</h3>
                <p>
                  Best of seven hands between the last team standing on each side. Final prize
                  amounts are announced before the first deal, once the bracket is set, and paid
                  within {EVENT.prize.payoutWindow} of the last hand.
                </p>
              </div>
            </div>
            <div className="prize-block">
              <h3>Prize pool</h3>
              <p>
                Every team&rsquo;s entry adds ${EVENT.prize.perTeam} to the pool, member or not.
                Top three teams split it:
              </p>
              <ul className="prize-split">
                {EVENT.prize.split.map((s, i) => (
                  <li key={s.place}>
                    <span>{s.place}</span>
                    <strong>{s.pct}%</strong>
                    <small>${full.amounts[i]} with a full bracket</small>
                  </li>
                ))}
              </ul>
              <p className="fine">
                A full {EVENT.teamCap}-team bracket is a ${full.pool} pool. Winnings are paid
                electronically to the team captain&rsquo;s HappiTime account within{" "}
                {EVENT.prize.payoutWindow} after the tournament ends.
              </p>
            </div>
          </section>

          {/* Rules */}
          <section className="rules" aria-labelledby="rules-title">
            <div className="rules-head">
              <h2 id="rules-title">Tournament rules</h2>
              <p>Read them before you register. Table captains enforce them as written.</p>
            </div>
            <ol>
              {RULES.map((r) => (
                <li key={r.title}>
                  <div>
                    <strong>{r.title}</strong>
                    {r.body && <span>{r.body}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <footer className="foot">
            <div>
              <strong>Questions?</strong>{" "}
              {EVENT.contactPhone || EVENT.contactEmail ? (
                <>
                  {EVENT.contactPhone && (
                    <a href={`sms:${EVENT.contactPhone.replace(/\D/g, "")}`}>
                      Text {EVENT.contactPhone}
                    </a>
                  )}
                  {EVENT.contactPhone && EVENT.contactEmail && " or "}
                  {EVENT.contactEmail && (
                    <a href={`mailto:${EVENT.contactEmail}`}>{EVENT.contactEmail}</a>
                  )}
                </>
              ) : (
                <a href="/contactus">Contact HappiTime</a>
              )}
            </div>
            <div>
              {EVENT.title} {EVENT.subtitle}. Powered by HappiTime.
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
