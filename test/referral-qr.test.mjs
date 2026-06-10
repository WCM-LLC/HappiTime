import test from "node:test";
import assert from "node:assert/strict";
import { referralQrUrl, renderReferralQrPng } from "../packages/venue-qr/index.mjs";

test("referralQrUrl encodes the /r/{handle} landing", () => {
  assert.equal(referralQrUrl("jwill86", "https://happitime.biz"), "https://happitime.biz/r/jwill86");
});
test("renderReferralQrPng returns a PNG buffer", async () => {
  const png = await renderReferralQrPng("jwill86", { size: 300 });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png[0], 0x89); assert.equal(png[1], 0x50); // PNG magic
});
