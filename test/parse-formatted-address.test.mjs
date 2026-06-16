import test from "node:test";
import assert from "node:assert/strict";
import { parseFormattedAddress } from "../apps/web/src/utils/parse-formatted-address.mjs";

test("parses a standard US formatted address", () => {
  assert.deepEqual(parseFormattedAddress("1580 Main St, Kansas City, MO 64108, USA"), {
    address: "1580 Main St",
    city: "Kansas City",
    state: "MO",
    zip: "64108",
  });
});

test("handles a missing country segment", () => {
  assert.deepEqual(parseFormattedAddress("928 Wyandotte St, Kansas City, MO 64105"), {
    address: "928 Wyandotte St",
    city: "Kansas City",
    state: "MO",
    zip: "64105",
  });
});

test("keeps a suite in the street segment", () => {
  assert.deepEqual(parseFormattedAddress("51 E 14th St Ste 200, Kansas City, MO 64106, USA"), {
    address: "51 E 14th St Ste 200",
    city: "Kansas City",
    state: "MO",
    zip: "64106",
  });
});

test("parses ZIP+4", () => {
  assert.deepEqual(parseFormattedAddress("1601 Oak St, Kansas City, MO 64108-1234, USA"), {
    address: "1601 Oak St",
    city: "Kansas City",
    state: "MO",
    zip: "64108-1234",
  });
});

test("returns graceful partial on an unexpected shape", () => {
  assert.deepEqual(parseFormattedAddress("Some Place"), {
    address: "Some Place",
    city: "",
    state: "",
    zip: "",
  });
});

test("empty / nullish input yields empty fields", () => {
  assert.deepEqual(parseFormattedAddress(""), { address: "", city: "", state: "", zip: "" });
  assert.deepEqual(parseFormattedAddress(null), { address: "", city: "", state: "", zip: "" });
});
