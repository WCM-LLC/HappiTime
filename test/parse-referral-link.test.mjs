import test from "node:test";
import assert from "node:assert/strict";
import { parseReferralLink } from "../apps/mobile/src/lib/parseReferralLink.mjs";

test("parses https /r/{handle}", () => {
  assert.deepEqual(parseReferralLink("https://happitime.biz/r/jwill86"), { handle: "jwill86" });
  assert.deepEqual(parseReferralLink("https://happitime.biz/r/jwill86/"), { handle: "jwill86" });
});
test("parses custom scheme happitime://referral/{handle}", () => {
  assert.deepEqual(parseReferralLink("happitime://referral/jwill86"), { handle: "jwill86" });
});
test("rejects non-referral + malformed handles", () => {
  assert.equal(parseReferralLink("https://happitime.biz/v/some-bar"), null);
  assert.equal(parseReferralLink("https://happitime.biz/r/BAD HANDLE"), null);
  assert.equal(parseReferralLink(42), null);
});
