# Mobile Window-less Venues — Searchable & Addable (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make happy-hour-window-less venues (e.g. Cortadito, Dos Lokos) findable while building an itinerary and addable to an itinerary on mobile.

**Architecture:** Extract the existing "Add to Itinerary" button + picker modal from `HappyHourDetailScreen` into a reusable `AddToItinerarySheet` component, reuse it on `VenuePreviewScreen` (rendering the venue name + button above the screen's empty-state gate, with the name fetched by id), and let `MapScreen`'s direct venue search run alongside an open itinerary by removing the `hasItineraryFilter` short-circuit and merging searched venues into the itinerary-mode pin list.

**Tech Stack:** React Native (Expo), TypeScript, `@happitime/shared-api` (`fetchVenueById`), `useUserLists` hook, Supabase (`user_list_items`). Tests are source-introspection `node --test` `.mjs` files (CI runs `test/*.test.mjs`); runtime behavior is verified on the iOS simulator.

**Spec:** `docs/superpowers/specs/2026-06-02-mobile-windowless-venues-addable-design.md`

**Branch:** `feat/mobile-windowless-venues-addable` (already created)

---

## Testing approach (read first)

This codebase does not unit-test React Native components — the established pattern
(`apps/mobile/src/hooks/useVisitRating.test.mjs`, root `test/*.test.mjs`) is
**source-introspection**: read a source file with `readFileSync` and assert on its
contents with regex. `node --test` has no TS loader, so we cannot import `.tsx`.
Therefore each code task is driven by a source-introspection test that fails before
the change and passes after, and **runtime behavior is verified on the simulator in
Task 4**. Tests live in `test/mobile-windowless-venues.test.mjs` so they run in CI
(`npm test` → `node --test test/*.test.mjs`).

Commands used throughout:
- Run the new tests: `node --test test/mobile-windowless-venues.test.mjs`
- Typecheck mobile: `npm run typecheck --workspace mobile`
- Lint mobile: `npm run lint --workspace mobile`

---

## File Structure

- **Create:** `apps/mobile/src/components/AddToItinerarySheet.tsx` — self-contained
  "Add to Itinerary" primary button + picker modal + create-list form. Owns its own
  `useUserLists()` and modal state. Prop: `venueId: string | null`.
- **Modify:** `apps/mobile/src/screens/HappyHourDetailScreen.tsx` — replace the inline
  button + modal + picker state + `pickerStyles` with `<AddToItinerarySheet>`.
- **Modify:** `apps/mobile/src/screens/VenuePreviewScreen.tsx` — fetch venue name by
  id; render name + `<AddToItinerarySheet>` above the empty-state gate.
- **Modify:** `apps/mobile/src/screens/MapScreen.tsx` — enable direct venue search in
  itinerary mode; merge searched venues into the itinerary pin list; keep camera-fit
  bound to itinerary venues only.
- **Create:** `test/mobile-windowless-venues.test.mjs` — source-introspection tests.

---

## Task 1: Extract `AddToItinerarySheet` and reuse it in `HappyHourDetailScreen`

**Files:**
- Create: `apps/mobile/src/components/AddToItinerarySheet.tsx`
- Modify: `apps/mobile/src/screens/HappyHourDetailScreen.tsx`
- Test: `test/mobile-windowless-venues.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/mobile-windowless-venues.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

test("AddToItinerarySheet component exists and takes a venueId prop", () => {
  const src = read("apps/mobile/src/components/AddToItinerarySheet.tsx");
  assert.match(src, /export const AddToItinerarySheet/);
  assert.match(src, /venueId/);
  assert.match(src, /useUserLists/);
  // Owns the picker + create-list flow it was extracted from.
  assert.match(src, /Add to Itinerary/);
  assert.match(src, /createList/);
  assert.match(src, /addVenue/);
});

test("HappyHourDetailScreen delegates add-to-itinerary to the shared component", () => {
  const src = read("apps/mobile/src/screens/HappyHourDetailScreen.tsx");
  assert.match(src, /import \{ AddToItinerarySheet \}/);
  assert.match(src, /<AddToItinerarySheet\s+venueId=\{venueId\}\s*\/>/);
  // Inline picker state was removed from the screen.
  assert.doesNotMatch(src, /setShowItineraryPicker/);
  assert.doesNotMatch(src, /const pickerStyles = StyleSheet\.create/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: FAIL — `AddToItinerarySheet.tsx` does not exist (ENOENT) / assertions unmet.

- [ ] **Step 3: Create the component**

Create `apps/mobile/src/components/AddToItinerarySheet.tsx`:

```tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useUserLists } from "../hooks/useUserLists";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = {
  venueId: string | null;
};

export const AddToItinerarySheet: React.FC<Props> = ({ venueId }) => {
  const { lists, addVenue, createList } = useUserLists();
  const [showItineraryPicker, setShowItineraryPicker] = useState(false);
  const [addedToIds, setAddedToIds] = useState<Set<string>>(new Set());
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [newListVisibility, setNewListVisibility] = useState<
    "private" | "friends" | "public"
  >("private");
  const [creatingList, setCreatingList] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          pressed && styles.actionButtonPressed,
        ]}
        onPress={() => setShowItineraryPicker(true)}
      >
        <Text style={styles.actionText}>Add to Itinerary</Text>
      </Pressable>

      <Modal
        visible={showItineraryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowItineraryPicker(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setShowItineraryPicker(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Add to Itinerary</Text>

            {lists.length === 0 || showCreateForm ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.createForm}
              >
                <Text style={styles.createLabel}>Create a new itinerary</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Name (e.g. Friday Night Crawl)"
                  placeholderTextColor={colors.textMutedLight}
                  value={newListName}
                  onChangeText={setNewListName}
                  autoFocus
                />
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.textMutedLight}
                  value={newListDesc}
                  onChangeText={setNewListDesc}
                  multiline
                />
                <View style={styles.visRow}>
                  {(["private", "friends", "public"] as const).map((v) => (
                    <Pressable
                      key={v}
                      style={[
                        styles.visChip,
                        newListVisibility === v && styles.visChipActive,
                      ]}
                      onPress={() => setNewListVisibility(v)}
                    >
                      <Text
                        style={[
                          styles.visChipText,
                          newListVisibility === v && styles.visChipTextActive,
                        ]}
                      >
                        {v === "private"
                          ? "Private"
                          : v === "friends"
                          ? "Friends"
                          : "Public"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[
                    styles.createBtn,
                    (!newListName.trim() || creatingList) && { opacity: 0.5 },
                  ]}
                  disabled={!newListName.trim() || creatingList}
                  onPress={async () => {
                    setCreatingList(true);
                    const { error, listId } = await createList(
                      newListName,
                      newListDesc || undefined
                    );
                    let addError: Error | null = null;
                    if (!error && listId && venueId) {
                      const result = await addVenue(listId, venueId);
                      addError = result.error;
                    }
                    setCreatingList(false);
                    if (error) {
                      Alert.alert("Error", error.message);
                    } else if (addError) {
                      Alert.alert(
                        "Itinerary created",
                        `Couldn't add this venue yet: ${addError.message}`
                      );
                    } else {
                      if (listId) {
                        setAddedToIds((prev) => new Set(prev).add(listId));
                      }
                      setNewListName("");
                      setNewListDesc("");
                      setNewListVisibility("private");
                      setShowCreateForm(false);
                    }
                  }}
                >
                  <Text style={styles.createBtnText}>
                    {creatingList ? "Creating…" : "Create Itinerary"}
                  </Text>
                </Pressable>
                {lists.length > 0 && (
                  <Pressable onPress={() => setShowCreateForm(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : (
              <>
                <FlatList
                  data={lists}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  renderItem={({ item }) => {
                    const added = addedToIds.has(item.id);
                    const adding = addingToId === item.id;
                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.row,
                          pressed && { opacity: 0.75 },
                        ]}
                        disabled={added || adding}
                        onPress={async () => {
                          if (!venueId) return;
                          setAddingToId(item.id);
                          const { error } = await addVenue(item.id, venueId);
                          setAddingToId(null);
                          if (error) {
                            Alert.alert("Couldn't add", error.message);
                          } else {
                            setAddedToIds((prev) => new Set(prev).add(item.id));
                          }
                        }}
                      >
                        <View style={styles.rowText}>
                          <Text style={styles.rowName}>{item.name}</Text>
                          {item.description ? (
                            <Text style={styles.rowDesc} numberOfLines={1}>
                              {item.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.rowAction,
                            added && styles.rowActionDone,
                          ]}
                        >
                          {adding ? "…" : added ? "Added ✓" : "Add"}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
                <Pressable
                  style={styles.newListBtn}
                  onPress={() => setShowCreateForm(true)}
                >
                  <Text style={styles.newListBtnText}>+ New Itinerary</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "60%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rowAction: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: "hidden",
  },
  rowActionDone: {
    backgroundColor: colors.surface,
    color: colors.textMuted,
  },
  createForm: {
    paddingVertical: spacing.sm,
  },
  createLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  visRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  visChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  visChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  visChipTextActive: {
    color: "#FFFFFF",
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.md,
  },
  newListBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  newListBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
});
```

- [ ] **Step 4: Refactor `HappyHourDetailScreen` to use the component**

In `apps/mobile/src/screens/HappyHourDetailScreen.tsx`:

1. Add the import near the other component imports (after the `ImageLightbox` import, ~line 39):
   ```tsx
   import { AddToItinerarySheet } from "../components/AddToItinerarySheet";
   ```
2. Delete the picker state block (lines 70–77): the seven `useState` lines from
   `const [showItineraryPicker, ...]` through `const [creatingList, ...]`. Also delete
   `addVenue, createList` from the `useUserLists()` destructure on line 69 — leaving
   `const { lists } = useUserLists();` **only if `lists` is still used elsewhere**; if
   `lists` is not referenced elsewhere after this task, delete the whole
   `useUserLists()` line. (Verify by searching the file for `lists`.)
3. Replace the primary "Add to Itinerary" `Pressable` (lines 590–598) with the
   component, keeping it as the first child of `<View style={styles.actions}>`:
   ```tsx
   <View style={styles.actions}>
     <AddToItinerarySheet venueId={venueId} />
     <View style={styles.actionSecondaryRow}>
       {/* ...unchanged phone/website/social icon buttons... */}
     </View>
   </View>
   ```
4. Delete the entire `<Modal visible={showItineraryPicker} ...> ... </Modal>` block
   (lines 644–804).
5. Delete the `pickerStyles` StyleSheet (lines 1230–1380).
6. Remove now-unused imports from the `react-native` import block: `Modal`,
   `FlatList`, `TextInput`, `KeyboardAvoidingView` — **only if not used elsewhere in
   the file** (search the file for each before removing). Leave `Platform`, `Alert`,
   `ScrollView`, `Pressable` (still used).

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: PASS (both Task 1 tests).

Run: `npm run typecheck --workspace mobile`
Expected: no errors (resolves unused-import / undefined-symbol issues from the edit).

Run: `npm run lint --workspace mobile`
Expected: no new errors (catches leftover unused imports/vars).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/AddToItinerarySheet.tsx \
        apps/mobile/src/screens/HappyHourDetailScreen.tsx \
        test/mobile-windowless-venues.test.mjs
git commit -m "refactor(mobile): extract AddToItinerarySheet from HappyHourDetailScreen"
```

---

## Task 2: Show name + Add button on `VenuePreviewScreen` above the empty-state gate

**Files:**
- Modify: `apps/mobile/src/screens/VenuePreviewScreen.tsx`
- Test: `test/mobile-windowless-venues.test.mjs`

Background: `VenuePreviewScreen.tsx:268` renders ONLY the empty message when
`windowsForVenue.length === 0 && events.length === 0`, and `venueName` (line 139) is
derived from `windowsForVenue[0]?.venue?.name` — so a window-less venue shows no name
and no actions. This task fetches the name by id and renders name + the Add button
above the gate. (Address/phone/socials/media parity is Phase 2, not here.)

- [ ] **Step 1: Write the failing test**

Append to `test/mobile-windowless-venues.test.mjs`:

```js
test("VenuePreviewScreen fetches venue by id and renders Add above the empty-state gate", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.match(src, /import \{ AddToItinerarySheet \}/);
  assert.match(src, /fetchVenueById/);
  assert.match(src, /<AddToItinerarySheet\s+venueId=\{venueId\}\s*\/>/);
  // Name no longer depends solely on a happy-hour window.
  assert.match(src, /fetchedVenueName/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: FAIL — Task 2 assertions unmet (Task 1 tests still pass).

- [ ] **Step 3: Add the venue-name fetch**

In `apps/mobile/src/screens/VenuePreviewScreen.tsx`:

1. Add imports (with the other imports, ~after line 27):
   ```tsx
   import { fetchVenueById } from "@happitime/shared-api";
   import { AddToItinerarySheet } from "../components/AddToItinerarySheet";
   ```
2. Add state + an effect to fetch the venue name by id. Place immediately after the
   existing `const { venueId } = route.params;` / hooks block (after line 78, alongside
   the other `useState`/`useEffect` declarations — before the early `loading`/`error`
   returns at line 151):
   ```tsx
   const [fetchedVenueName, setFetchedVenueName] = useState<string | null>(null);

   useEffect(() => {
     if (!venueId) return;
     let active = true;
     fetchVenueById(supabase as any, venueId)
       .then(({ data }) => {
         if (active && data?.name) setFetchedVenueName(data.name);
       })
       .catch(() => {
         /* name falls back to the window-derived value */
       });
     return () => {
       active = false;
     };
   }, [venueId]);
   ```
3. Change the `venueName` derivation (line 139) to prefer the window name, then the
   fetched name, then the placeholder:
   ```tsx
   const venueName =
     windowsForVenue[0]?.venue?.name ?? fetchedVenueName ?? "This venue";
   ```

- [ ] **Step 4: Render name + Add button above the empty-state gate**

Replace the empty-state conditional (lines 268–272) so the name and Add button always
render, and only the happy-hours/events list stays behind the gate. The block
currently is:

```tsx
{windowsForVenue.length === 0 && events.length === 0 ? (
  <Text style={styles.emptyText}>
    {venueName} doesn&apos;t have any published happy hours or events yet.
  </Text>
) : (
  <>
    <Text style={styles.title}>{venueName}</Text>
    {/* ...check-in button + FlatList... */}
  </>
)}
```

Change it to always show the title + Add button, with the empty message shown inline
when there is nothing else:

```tsx
<Text style={styles.title}>{venueName}</Text>
<AddToItinerarySheet venueId={venueId} />
{windowsForVenue.length === 0 && events.length === 0 ? (
  <Text style={styles.emptyText}>
    {venueName} doesn&apos;t have any published happy hours or events yet.
  </Text>
) : (
  <>
    <Text style={styles.subtitle}>Tap below to see Menus</Text>
    {/* ...existing check-in button + FlatList exactly as before... */}
  </>
)}
```

Note: the `<Text style={styles.title}>` and `<Text style={styles.subtitle}>Tap below
to see Menus</Text>` lines move out of the `else` branch as shown — `title` and the
Add button are now unconditional; `subtitle` stays with the list branch. Keep the
`checkInButton` `Pressable` and the `FlatList` exactly as they are inside the `else`.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: PASS (Task 1 + Task 2 tests).

Run: `npm run typecheck --workspace mobile`
Expected: no errors.

Run: `npm run lint --workspace mobile`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/VenuePreviewScreen.tsx test/mobile-windowless-venues.test.mjs
git commit -m "feat(mobile): add-to-itinerary + venue name on VenuePreview for window-less venues"
```

---

## Task 3: Enable venue search in itinerary mode and merge results (MapScreen G1)

**Files:**
- Modify: `apps/mobile/src/screens/MapScreen.tsx`
- Test: `test/mobile-windowless-venues.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/mobile-windowless-venues.test.mjs`:

```js
test("MapScreen runs venue search even with an itinerary open (G1)", () => {
  const src = read("apps/mobile/src/screens/MapScreen.tsx");
  // The search effect must no longer bail out just because an itinerary is open.
  assert.doesNotMatch(
    src,
    /if \(hasItineraryFilter \|\| directVenueSearchNeedles\.length === 0\)/
  );
  assert.match(src, /if \(directVenueSearchNeedles\.length === 0\)/);
  // Itinerary-mode pin list merges searched venues.
  assert.match(src, /merge searched venues/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: FAIL — Task 3 assertions unmet (Tasks 1–2 still pass).

- [ ] **Step 3: Remove the itinerary short-circuit on the search effect**

In `apps/mobile/src/screens/MapScreen.tsx`, change the guard at line 383 from:

```tsx
    if (hasItineraryFilter || directVenueSearchNeedles.length === 0) {
      setSearchedVenues([]);
      return;
    }
```

to:

```tsx
    if (directVenueSearchNeedles.length === 0) {
      setSearchedVenues([]);
      return;
    }
```

Then update that effect's dependency array (line 446) from:

```tsx
  }, [directVenueSearchKey, directVenueSearchNeedles, hasItineraryFilter]);
```

to:

```tsx
  }, [directVenueSearchKey, directVenueSearchNeedles]);
```

- [ ] **Step 4: Merge searched venues into the itinerary-mode pin list**

In the `mappableWindows` memo, itinerary branch, the list is currently built and then
returned via `.sort(...)` (lines 495–499):

```tsx
    return itineraryWindows.sort((a, b) => {
      const aIndex = itineraryVenueIds.indexOf(getWindowVenueId(a) ?? "");
      const bIndex = itineraryVenueIds.indexOf(getWindowVenueId(b) ?? "");
      return aIndex - bIndex;
    });
```

Replace that `return` with: sort the itinerary windows first, then append searched
venues (deduped, requiring coordinates) so search results show without disturbing
itinerary order or the camera fit:

```tsx
    const sortedItinerary = itineraryWindows.sort((a, b) => {
      const aIndex = itineraryVenueIds.indexOf(getWindowVenueId(a) ?? "");
      const bIndex = itineraryVenueIds.indexOf(getWindowVenueId(b) ?? "");
      return aIndex - bIndex;
    });

    // merge searched venues (appended after the itinerary, deduped, coords required)
    const withSearch = [...sortedItinerary];
    for (const venue of searchedVenues) {
      if (
        !venue.id ||
        seenVenueIds.has(venue.id) ||
        venue.lat == null ||
        venue.lng == null
      ) {
        continue;
      }
      seenVenueIds.add(venue.id);
      withSearch.push(createVenueWindow(venue));
    }
    return withSearch;
```

Then add `searchedVenues` to the `mappableWindows` memo dependency array (it is at
lines 500–507; it already lists `combinedItineraryVenues`, `data`, `hasItineraryFilter`,
`itineraryVenueIdSet`, `itineraryVenueIds`, `searchedVenues`). **`searchedVenues` is
already in that dependency array** — confirm it is present; no change needed if so.

- [ ] **Step 5: Keep camera-fit bound to itinerary venues only**

`itineraryCoordinates` (lines 561–566) currently derives from `filtered`, which now
includes searched venues in itinerary mode — that would zoom the map to fit search
results. Change it to derive from the itinerary venues only:

```tsx
  const itineraryCoordinates = useMemo(() => {
    if (!hasItineraryFilter) return [];
    return combinedItineraryVenues
      .map((venue) => {
        const latitude = toNullableCoordinate(venue.lat);
        const longitude = toNullableCoordinate(venue.lng);
        if (latitude == null || longitude == null) return null;
        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
        return { latitude, longitude };
      })
      .filter(
        (coord): coord is { latitude: number; longitude: number } => coord != null
      );
  }, [combinedItineraryVenues, hasItineraryFilter]);
```

(`toNullableCoordinate` is already defined at the top of the file, line 73.)

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `node --test test/mobile-windowless-venues.test.mjs`
Expected: PASS (all tests).

Run: `npm run typecheck --workspace mobile`
Expected: no errors.

Run: `npm run lint --workspace mobile`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/MapScreen.tsx test/mobile-windowless-venues.test.mjs
git commit -m "feat(mobile): allow venue search while an itinerary is open on the map"
```

---

## Task 4: Simulator verification (the real proof)

**Files:** none (manual/observed verification on the iOS simulator).

Goal: verify the actual user flow, not just source assertions. Use the two seeded
window-less venues: **Cortadito Cuban Cafe** and **Dos Lokos Sports Cantina**.

- [ ] **Step 1: Launch the app on the simulator**

Run (from `apps/mobile`): `npx expo start --ios`
(See the project's run skill / `apps/mobile` README if a dev client is required.)
Sign in as a normal user account.

- [ ] **Step 2: Verify itinerary-mode search (the reported flow)**

1. Open an existing itinerary → "Show on the Map" (puts the map in itinerary mode).
2. In the map search box, type "Cortadito".
3. **Expected:** a result/pin for Cortadito Cuban Cafe appears (previously: nothing).
4. Tap it → `VenuePreview` opens showing the venue **name** and an **"Add to
   Itinerary"** button (previously: "This venue doesn't have any published happy hours
   or events yet").
5. Tap "Add to Itinerary" → pick the itinerary → expect "Added ✓".
6. Repeat for "Dos Lokos".

- [ ] **Step 3: Verify the add persisted**

Confirm a row was written (via Supabase SQL):

```sql
select li.list_id, ul.name as list_name, v.name as venue_name, li.created_at
from user_list_items li
join venues v on v.id = li.venue_id
left join user_lists ul on ul.id = li.list_id
where v.id in (
  '8d64a8d3-3f38-4454-9f24-da33265e9300', -- Cortadito Cuban Cafe
  '8301efd0-9ca8-4431-b741-8c326ed03279'  -- Dos Lokos Sports Cantina
)
order by li.created_at desc;
```

Expected: one row per venue added, pointing at the chosen itinerary.

- [ ] **Step 4: Confirm discovery-mode search (validates the "out of scope" claim)**

1. Clear the itinerary view (back to plain discover map, no itinerary attached).
2. Search "Cortadito" and "Dos Lokos".
3. **Expected:** both appear here too. If they do NOT, discovery-mode search has its
   own bug — STOP and fold a fix into this plan (re-open Task 3 scope) before closing.

- [ ] **Step 5: Regression check on a windowed venue**

Open a normal happy-hour venue from the Home feed → `HappyHourDetail` → confirm the
"Add to Itinerary" button + picker still work exactly as before (the extracted
component did not change behavior).

---

## Self-Review (completed during planning)

- **Spec coverage:** G1 (search in itinerary mode) → Task 3. G2 (add affordance on the
  screen map cards open) → Tasks 1–2. Window-less venue shows a name → Task 2.
  Component extraction (DRY) → Task 1. Simulator verification (user-requested) →
  Task 4. Discovery-search assumption → Task 4 Step 4. Phase 2 parity is explicitly
  out of scope.
- **Placeholders:** none — every code step shows the full code or exact edit.
- **Type/name consistency:** `AddToItinerarySheet` prop `venueId: string | null` used
  consistently; `fetchVenueById(supabase, venueId)` matches the `@happitime/shared-api`
  signature (`{ data, error }`); `createVenueWindow`, `toNullableCoordinate`,
  `getWindowVenueId`, `seenVenueIds`, `combinedItineraryVenues`, `searchedVenues` all
  reference existing MapScreen symbols.

## Out of scope (Phase 2 — separate plan/PR)

Full venue-detail parity for window-less venues: address, phone, website, socials, and
media on `VenuePreviewScreen`, sourced from `fetchVenueById` rather than happy-hour
windows. Net-new venue-header UI affecting all venues.
