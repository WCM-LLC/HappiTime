import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { PageTracker } from "@/components/PageTracker";
import { Register } from "./Register";
import { Spade } from "./Spade";
import { EVENT, RULES } from "./event";
import "./tournament.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-tnt",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tacos & Tables with Good Company — Spades Tournament, Oct 13",
  description:
    "Spades tournament night at In Good Company in the Crossroads. Tuesday, October 13: doors 5 PM, first deal 6 PM. $20 per player plus $5 non-member entry, 16-team double-elimination bracket. Tacos from the NotCho' Taco truck outside, music by DJ Stixx. Register by October 12.",
  alternates: { canonical: "/sponsored-events/tacos-and-tables/" },
  openGraph: {
    title: "Tacos & Tables with Good Company — Spades Tournament",
    description:
      "Tuesday 10.13 at In Good Company, Crossroads. Doors 5 PM, first deal 6 PM. $20 per player. Register by October 12.",
    url: "https://happitime.biz/sponsored-events/tacos-and-tables/",
    images: [{ url: "/sponsored-events/tacos-and-tables/og.jpg", width: 1200, height: 630 }],
  },
};

const sponsorLine = EVENT.sponsors.join(", ").replace(/, ([^,]*)$/, " and $1");

export default function TacosAndTablesPage() {
  return (
    <>
      <PageTracker pagePath={`/sponsored-events/${EVENT.slug}/`} />
      <div className={`tnt ${bricolage.variable}`}>
        <div className="wrap">
          {/* Hero: the playing card */}
          <section className="top" aria-labelledby="title">
            <div className="card">
              <div className="index index-tl" aria-hidden="true">
                <span>13</span>
                <Spade />
              </div>
              <div className="index index-br" aria-hidden="true">
                <span>13</span>
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
                      ${EVENT.entryFee} per player, plus ${EVENT.nonMemberEntry} non-member entry at the door
                    </dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>
                      {EVENT.teamCap}-team double elimination, {EVENT.ageMin}+
                    </dd>
                  </div>
                </dl>
                <a className="cta" href="#register">
                  Register your spot
                </a>
                <p className="sponsors">Sponsored by {sponsorLine}</p>
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
                  Doors open. Check in, grab tacos from the NotCho&rsquo; Taco truck parked
                  outside, get a drink, and find your table. DJ Stixx is on all night. Not an
                  In Good Company member? It&rsquo;s ${EVENT.nonMemberEntry} at the door.
                </p>
              </div>
              <div>
                <h3>{EVENT.firstDeal}</h3>
                <p>
                  First deal, on the dot, across {EVENT.tables} tables. Double elimination:
                  lose once and you drop to the losers&rsquo; bracket, lose twice and you&rsquo;re
                  out. Solo players are paired up at check-in.
                </p>
              </div>
              <div>
                <h3>The finals</h3>
                <p>
                  Semifinal and grand final are best of five hands. The bracket is capped
                  at {EVENT.teamCap} teams; after that, you&rsquo;re on the waitlist.
                </p>
              </div>
            </div>
            {EVENT.prize && (
              <p className="prize">
                <strong>Prize:</strong> {EVENT.prize}
              </p>
            )}
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
