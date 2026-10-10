// Shown in place of the RSVP form while the brunch is postponed.
// Flip POSTPONED in page.tsx to bring the form back; nothing else changes.
export function Postponed({ className = "" }: { className?: string }) {
  return (
    <div className={`slb ${className}`}>
      <div className="wrap">
        <section className="grid hero" aria-labelledby="title">
          <div className="tear">
            <div className="sheet">
              <span className="badge">Postponed</span>
              <div className="presents">
                The Blacklist × MEPA<span>Presents</span>
              </div>
              <h1 id="title">The Social Life Brunch</h1>
              <div className="tag">Exclusive brunch × day party</div>
              <div className="edition">Fall Edition</div>
              <div className="when">
                <div className="dow">New date</div>
                <div className="date">TBA</div>
                <div className="time">Coming soon</div>
                <div className="full">18th &amp; Vine · Your RSVP carries over</div>
              </div>
            </div>
          </div>

          <div className="portrait tear">
            <div className="sheet">
              {/* eslint-disable-next-line @next/next/no-img-element -- local asset, outside the Cloudinary loader */}
              <img
                src="/sponsored-events/social-life-brunch/portrait.jpg"
                alt="A guest in a champagne satin blouse, chin resting on her hand."
                width={990}
                height={1142}
              />
              <div className="caption">Elevated brunch · Sophisticated style · Undeniable vibes</div>
            </div>
          </div>
        </section>

        <section className="grid" style={{ marginTop: "clamp(16px,2.4vw,28px)" }}>
          <div className="rsvp tear">
            <div className="sheet">
              <div className="sec-head">
                <h2>A quick note</h2>
                <p>From the host team</p>
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 17, lineHeight: 1.5 }}>
                The Fall Edition is moving off Sunday, October 11. We are locking in the new
                date now and will share it here and with everyone who has already RSVP&rsquo;d.
              </p>
              <p style={{ margin: "0 0 14px", fontSize: 17, lineHeight: 1.5 }}>
                <strong>If you already requested a seat, you are still on the list.</strong>{" "}
                There is nothing you need to do. RSVPs reopen once the new date is set.
              </p>
              <p className="fine" style={{ maxWidth: "52ch" }}>
                Questions: text <span className="sel">816-721-1419</span> or visit{" "}
                <a href="https://theblacklisthub.com" target="_blank" rel="noopener">
                  theblacklisthub.com
                </a>
                .
              </p>
            </div>
          </div>

          <aside className="details">
            <div className="memo tear">
              <div className="sheet">
                <h2>Memo</h2>
                <p>
                  We are creating a room where influence meets intention: an elevated social
                  experience designed for genuine connection, meaningful conversation, and
                  memorable moments.
                </p>
                <div className="rule"></div>
                <dl className="facts" style={{ textAlign: "left" }}>
                  <div>
                    <dt>Date</dt>
                    <dd>New date to be announced</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>18th &amp; Vine, Kansas City. Full address in the HappiTime app.</dd>
                  </div>
                  <div>
                    <dt>Dress</dt>
                    <dd>Dressed ensembles in shades of brown and blue</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="powered">
              <small>Powered by</small>
              <div>HappiTime · Hennessy · Don Julio</div>
            </div>
          </aside>
        </section>

        <footer>The Blacklist × MEPA · The Social Life Brunch, Fall Edition</footer>
      </div>
    </div>
  );
}
