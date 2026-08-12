// src/screens/ScanMenuScreen.tsx
//
// Self-serve menu intake, phone-first. Photograph a chalkboard or printed
// happy hour menu; a vision model turns it into windows + a menu, you correct
// what it got wrong, and it goes live.
//
// Four steps: venue → photo → review → done.
//
// What happens on submit is the SERVER's call, not this screen's:
//   org owner/admin → publishes immediately (scanning your own menu IS the approval)
//   org editor      → draft, queued for their own org's owner/admin
//   super user      → draft, queued for the venue's org (or HappiTime staff
//                     when the venue has no org behind it)
// The screen never infers that from the tier — it reads `can_publish` for the
// chosen venue, so its copy can't promise something the server won't do.
//
// CAMERA IS iOS-ONLY, deliberately. AndroidManifest.xml carries no CAMERA
// permission, so requestCameraPermissionsAsync() can only ever come back
// denied there. A manifest entry needs a native build; this screen ships over
// the air, so Android gets the library picker until that build goes out.
// See app.json's expo-image-picker plugin block for the pending permission.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { RootStackParamList } from "../navigation/types";
import {
  commitMenu,
  extractMenuFromPhoto,
  fetchIntakeSession,
  fetchVenueScanContext,
  findMatchingWindow,
  searchIntakeVenues,
  IntakeError,
  type ContentType,
  type ExistingWindow,
  type ExtractedSection,
  type ExtractedWindow,
  type ProposedEvent,
  type IntakeSession,
  type IntakeVenue,
} from "../api/intake";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = NativeStackScreenProps<RootStackParamList, "ScanMenu">;

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Wide enough for a chalkboard shot to stay legible, small enough that the
// upload finishes on a bar's wifi and lands well under the server's 8 MB cap.
const MAX_UPLOAD_WIDTH = 1600;

type Step = "venue" | "photo" | "review" | "done";

/** The types a person can pick. "unknown" is a model output, never a choice. */
const CONFIRMABLE_TYPES: ContentType[] = ["happy_hour", "event", "event_series", "mixed"];

const TYPE_LABELS: Record<ContentType, string> = {
  happy_hour: "A happy hour",
  event: "A one-time event",
  event_series: "A weekly event",
  mixed: "Both a happy hour and an event",
  unknown: "Not sure",
};

const TYPE_HINTS: Record<ContentType, string> = {
  happy_hour: "Recurring deals tied to times of day",
  event: "Happens once, on a specific date",
  event_series: "Repeats every week, like trivia night",
  mixed: "The board shows both",
  unknown: "",
};

type Outcome = {
  published: boolean;
  venueName: string;
  /** Who owns the approval when it wasn't published — null when it was. */
  reviewRoute: "owner" | "admin" | null;
  /** Events the server couldn't schedule. Surfaced so they aren't lost silently. */
  unschedulable: string[];
  eventCount: number;
};

export const ScanMenuScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const preselected = route.params?.venueId
    ? { id: route.params.venueId, name: route.params.venueName ?? "your venue" }
    : null;

  const [session, setSession] = useState<IntakeSession | null>(null);
  const [step, setStep] = useState<Step>(preselected ? "photo" : "venue");
  const [venue, setVenue] = useState<IntakeVenue | null>(preselected);
  const [error, setError] = useState<string>("");

  // venue search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<IntakeVenue[]>([]);
  const [searching, setSearching] = useState(false);

  // photo + extraction
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // review — what the photo is, as PROPOSED by the model and then confirmed
  // (or corrected) by the person holding the phone. Nothing commits on the
  // model's label alone: a flyer read as a happy hour would put an event's
  // hours on a venue's listing as if they ran every week.
  const [proposedType, setProposedType] = useState<ContentType>("unknown");
  const [confirmedType, setConfirmedType] = useState<ContentType | null>(null);
  const [events, setEvents] = useState<ProposedEvent[]>([]);

  const [windows, setWindows] = useState<ExtractedWindow[]>([]);
  // The venue's published windows. A scan that lines up with one of these
  // ATTACHES to it — commit inserts new_windows[] without deduping, so
  // skipping this step would duplicate the venue's happy hour.
  const [existingWindows, setExistingWindows] = useState<ExistingWindow[]>([]);
  // Whether THIS caller publishes THIS venue, straight from the server. An org
  // editor and an org owner are both the 'owner' tier but only one publishes,
  // so the copy below must never guess from the tier.
  const [canPublish, setCanPublish] = useState(false);
  // False when the venue-context lookup failed. Submitting in that state would
  // risk duplicate windows, so the review step blocks until it succeeds.
  const [contextLoaded, setContextLoaded] = useState(false);
  const [menuName, setMenuName] = useState("Happy Hour");
  const [sections, setSections] = useState<ExtractedSection[]>([]);
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let alive = true;
    fetchIntakeSession()
      .then((s) => alive && setSession(s))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load your account."));
    return () => {
      alive = false;
    };
  }, []);

  // Debounced venue search — same 200ms feel as the console's picker.
  useEffect(() => {
    const q = search.trim();
    if (venue || q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchIntakeVenues(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, venue]);

  // See the header note: Android can't be granted a permission its manifest
  // never declared, so offering the button there would only dead-end.
  const cameraAvailable = Platform.OS === "ios";

  const scansLeft = session?.scans_remaining ?? null;
  const outOfScans = scansLeft !== null && scansLeft <= 0;

  const runExtract = useCallback(
    async (uri: string, mimeType?: string) => {
      setExtracting(true);
      setError("");
      try {
        // Resize before upload: a modern phone camera easily clears 8 MB, and
        // the vision model gains nothing from the extra pixels.
        const shrunk = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: MAX_UPLOAD_WIDTH } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        // Both calls matter. Without the venue context we cannot tell an
        // existing window from a new one (commit does not dedup, so we would
        // duplicate the venue's happy hour) and we cannot say truthfully
        // whether submitting publishes. Failing that lookup therefore BLOCKS
        // submit rather than falling back to "everything is new" — the scan is
        // kept on screen and retryable.
        const [{ draft, contentType }, context] = await Promise.all([
          extractMenuFromPhoto({
            uri: shrunk.uri,
            mimeType: "image/jpeg",
            venueName: venue?.name,
          }),
          venue
            ? fetchVenueScanContext(venue.id)
                .then((c) => ({ ok: true as const, ...c }))
                .catch(() => ({ ok: false as const, windows: [], canPublish: false }))
            : Promise.resolve({ ok: false as const, windows: [], canPublish: false }),
        ]);
        setExistingWindows(context.windows);
        setCanPublish(context.canPublish);
        setContextLoaded(context.ok);
        if (!context.ok) {
          setError("We couldn't load this venue's current happy hours. Tap retry before submitting.");
        }
        setProposedType(contentType);
        // Deliberately NOT pre-confirmed. The person has to say what it is,
        // even when the model sounds certain.
        setConfirmedType(null);
        setEvents(Array.isArray(draft?.events) ? draft.events : []);
        setWindows(Array.isArray(draft?.windows) ? draft.windows : []);
        setMenuName(draft?.menu?.name?.trim() || "Happy Hour");
        setSections(Array.isArray(draft?.menu?.sections) ? draft.menu.sections : []);
        setNotes(draft?._notes ?? "");
        setStep("review");
        // A scan was spent whether or not the read was good.
        setSession((s) =>
          s && s.scans_remaining != null ? { ...s, scans_remaining: Math.max(0, s.scans_remaining - 1) } : s,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that photo.");
      } finally {
        setExtracting(false);
      }
    },
    [venue],
  );

  const retryContext = useCallback(async () => {
    if (!venue) return;
    setError("");
    try {
      const c = await fetchVenueScanContext(venue.id);
      setExistingWindows(c.windows);
      setCanPublish(c.canPublish);
      setContextLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Still couldn't load the venue.");
    }
  }, [venue]);

  const pickPhoto = useCallback(
    async (source: "camera" | "library") => {
      setError("");
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setError(
          source === "camera"
            ? "Camera access is needed to photograph a menu."
            : "Photo access is needed to pick a menu photo.",
        );
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 1 });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      await runExtract(asset.uri, asset.mimeType);
    },
    [runExtract],
  );

  // ── review-step editing ───────────────────────────────────────────────────
  const toggleDow = (wi: number, d: number) =>
    setWindows((ws) =>
      ws.map((w, i) =>
        i !== wi
          ? w
          : { ...w, dow: w.dow.includes(d) ? w.dow.filter((x) => x !== d) : [...w.dow, d].sort() },
      ),
    );

  const setWindowTime = (wi: number, key: "start_time" | "end_time", value: string) =>
    setWindows((ws) => ws.map((w, i) => (i === wi ? { ...w, [key]: value } : w)));

  const removeWindow = (wi: number) => setWindows((ws) => ws.filter((_, i) => i !== wi));

  const addWindow = () =>
    setWindows((ws) => [...ws, { dow: [1, 2, 3, 4, 5], start_time: "15:00", end_time: "18:00", label: null }]);

  const setItem = (si: number, ii: number, patch: Partial<ExtractedSection["items"][number]>) =>
    setSections((ss) =>
      ss.map((s, i) =>
        i !== si ? s : { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) },
      ),
    );

  const removeItem = (si: number, ii: number) =>
    setSections((ss) =>
      ss.map((s, i) => (i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) })),
    );

  const itemCount = useMemo(
    () => sections.reduce((n, s) => n + s.items.length, 0),
    [sections],
  );

  const badTimes = windows.some(
    (w) => !TIME_RE.test(w.start_time) || !TIME_RE.test(w.end_time) || w.dow.length === 0,
  );
  // What the person confirmed drives everything below — never proposedType.
  const isHappyHour = confirmedType === "happy_hour" || confirmedType === "mixed";
  const isEventy = confirmedType === "event" || confirmedType === "event_series" || confirmedType === "mixed";

  const happyHourReady = windows.length > 0 && itemCount > 0 && !badTimes;
  const eventsReady = events.length > 0 && events.every((e) => e.title.trim().length > 0);

  const canSubmit =
    Boolean(venue) &&
    contextLoaded &&
    confirmedType != null &&
    confirmedType !== "unknown" &&
    !submitting &&
    (isHappyHour ? happyHourReady : true) &&
    (isEventy ? eventsReady : true) &&
    (isHappyHour || isEventy);

  const submit = useCallback(async () => {
    if (!venue) return;
    setSubmitting(true);
    setError("");
    try {
      const cleanSections = sections
        .map((s) => ({
          name: s.name.trim(),
          items: s.items
            .filter((it) => it.name.trim().length > 0)
            .map((it) => ({
              name: it.name.trim(),
              price: it.price == null || Number.isNaN(it.price) ? null : it.price,
              description: it.description?.trim() || null,
            })),
        }))
        .filter((s) => s.name.length > 0 && s.items.length > 0);

      // Split the reviewed windows: ones that already exist on the venue are
      // attached by id, the rest are created. Sending everything as "new"
      // would duplicate the venue's happy hour on the first scan.
      const windowIds: string[] = [];
      const newWindows: ExtractedWindow[] = [];
      for (const w of windows) {
        const match = findMatchingWindow(w, existingWindows);
        if (match) windowIds.push(match.id);
        else newWindows.push(w);
      }

      const res = await commitMenu({
        venueId: venue.id,
        // The CONFIRMED type decides what gets written. A happy hour that the
        // person reclassified as an event must not also create windows.
        contentType: confirmedType ?? "unknown",
        windowIds: isHappyHour ? windowIds : [],
        newWindows: isHappyHour ? newWindows : [],
        menu: isHappyHour
          ? { name: menuName.trim() || "Happy Hour", sections: cleanSections }
          : { name: menuName.trim() || "Happy Hour", sections: [] },
        events: isEventy ? events : [],
      });
      setOutcome({
        published: Boolean(res.published),
        venueName: venue.name,
        reviewRoute: res.review_route ?? null,
        unschedulable: res.unschedulable_events ?? [],
        eventCount: (res.event_ids ?? []).length,
      });
      setStep("done");
    } catch (e) {
      if (e instanceof IntakeError && e.code === "invalid_payload") {
        setError("Some fields still need fixing — check times and item names.");
      } else {
        setError(e instanceof Error ? e.message : "Couldn't submit that menu.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [venue, windows, sections, menuName, existingWindows, confirmedType, events, isHappyHour, isEventy]);

  const startOver = () => {
    setStep(preselected ? "photo" : "venue");
    if (!preselected) setVenue(null);
    setPhotoUri(null);
    setWindows([]);
    setEvents([]);
    setProposedType("unknown");
    setConfirmedType(null);
    setSections([]);
    setOutcome(null);
    setError("");
  };

  // ── gate ──────────────────────────────────────────────────────────────────
  if (session && !session.tier) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.h1}>Menu scanning</Text>
        <Text style={styles.muted}>
          This is for venue owners and HappiTime super users. If you run a venue, claim it from your
          profile and it'll show up here.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>Scan a happy hour menu</Text>
      {scansLeft !== null && step !== "done" ? (
        <Text style={styles.muted}>
          {scansLeft} scan{scansLeft === 1 ? "" : "s"} left today
        </Text>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* STEP 1 — venue */}
      {step === "venue" ? (
        <View style={styles.card}>
          <Text style={styles.label}>Which venue?</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name"
            placeholderTextColor={colors.textMutedLight}
            autoCorrect={false}
            style={styles.input}
          />
          {searching ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} /> : null}
          {results.map((v) => (
            <Pressable
              key={v.id}
              style={styles.resultRow}
              onPress={() => {
                setVenue(v);
                setSearch("");
                setStep("photo");
              }}
            >
              <Text style={styles.resultName}>{v.name}</Text>
              {v.address ? <Text style={styles.resultMeta}>{[v.address, v.city].filter(Boolean).join(", ")}</Text> : null}
            </Pressable>
          ))}
          {search.trim().length >= 2 && !searching && results.length === 0 ? (
            <Text style={styles.muted}>No venues matched. Try fewer letters.</Text>
          ) : null}
        </View>
      ) : null}

      {/* STEP 2 — photo */}
      {step === "photo" ? (
        <View style={styles.card}>
          <Text style={styles.label}>{venue?.name}</Text>
          <Text style={styles.muted}>
            Photograph the whole board straight-on. Good light, no glare — that's most of the accuracy.
          </Text>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" /> : null}
          {extracting ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Reading the menu…</Text>
            </View>
          ) : (
            <>
              {cameraAvailable ? (
                <Pressable
                  style={[styles.primaryBtn, outOfScans && styles.btnDisabled]}
                  disabled={outOfScans}
                  onPress={() => pickPhoto("camera")}
                >
                  <Text style={styles.primaryBtnText}>Take a photo</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  cameraAvailable ? styles.secondaryBtn : styles.primaryBtn,
                  outOfScans && styles.btnDisabled,
                ]}
                disabled={outOfScans}
                onPress={() => pickPhoto("library")}
              >
                <Text style={cameraAvailable ? styles.secondaryBtnText : styles.primaryBtnText}>
                  {cameraAvailable ? "Choose from library" : "Choose a photo"}
                </Text>
              </Pressable>
              {!cameraAvailable ? (
                <Text style={styles.muted}>
                  Snap the board with your camera app, then pick it here.
                </Text>
              ) : null}
              {outOfScans ? (
                <Text style={styles.muted}>You've used today's scans. They reset at midnight.</Text>
              ) : null}
              {!preselected ? (
                <Pressable onPress={() => { setVenue(null); setStep("venue"); }}>
                  <Text style={styles.linkText}>Pick a different venue</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* STEP 3 — review */}
      {step === "review" ? (
        <>
          {/* The human gate. The model proposes; a person decides. Getting
              this wrong writes an event's hours onto a venue's listing as a
              weekly happy hour, or buries a happy hour in the events tab. */}
          <View style={styles.card}>
            <Text style={styles.label}>What did you photograph?</Text>
            {proposedType !== "unknown" ? (
              <Text style={styles.muted}>
                Looks like {TYPE_LABELS[proposedType].toLowerCase()}. Confirm or change it.
              </Text>
            ) : (
              <Text style={styles.muted}>
                We couldn&apos;t tell from the photo — pick the one that fits.
              </Text>
            )}
            {CONFIRMABLE_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setConfirmedType(t)}
                style={[styles.typeRow, confirmedType === t && styles.typeRowOn]}
              >
                <Text style={[styles.typeTitle, confirmedType === t && styles.typeTitleOn]}>
                  {TYPE_LABELS[t]}
                </Text>
                <Text style={styles.typeHint}>{TYPE_HINTS[t]}</Text>
              </Pressable>
            ))}
          </View>

          {notes ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{notes}</Text>
            </View>
          ) : null}

          {isHappyHour ? (
          <View style={styles.card}>
            <Text style={styles.label}>When it runs</Text>
            {windows.length === 0 ? (
              <Text style={styles.muted}>No times were readable — add one below.</Text>
            ) : null}
            {windows.map((w, wi) => (
              <View key={wi} style={styles.windowBlock}>
                {findMatchingWindow(w, existingWindows) ? (
                  <Text style={styles.matchNote}>Updates a time you already have</Text>
                ) : null}
                <View style={styles.dowRow}>
                  {DOW_LABELS.map((d, i) => (
                    <Pressable
                      key={i}
                      onPress={() => toggleDow(wi, i)}
                      style={[styles.dowChip, w.dow.includes(i) && styles.dowChipOn]}
                    >
                      <Text style={[styles.dowChipText, w.dow.includes(i) && styles.dowChipTextOn]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.timeRow}>
                  <TextInput
                    value={w.start_time}
                    onChangeText={(t) => setWindowTime(wi, "start_time", t)}
                    placeholder="15:00"
                    placeholderTextColor={colors.textMutedLight}
                    style={[styles.input, styles.timeInput, !TIME_RE.test(w.start_time) && styles.inputBad]}
                  />
                  <Text style={styles.muted}>to</Text>
                  <TextInput
                    value={w.end_time}
                    onChangeText={(t) => setWindowTime(wi, "end_time", t)}
                    placeholder="18:00"
                    placeholderTextColor={colors.textMutedLight}
                    style={[styles.input, styles.timeInput, !TIME_RE.test(w.end_time) && styles.inputBad]}
                  />
                  <Pressable onPress={() => removeWindow(wi)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={addWindow}>
              <Text style={styles.linkText}>+ Add another time</Text>
            </Pressable>
          </View>
          ) : null}

          {isHappyHour ? (
          <View style={styles.card}>
            <Text style={styles.label}>What's on it</Text>
            {sections.map((s, si) => (
              <View key={si} style={styles.sectionBlock}>
                <Text style={styles.sectionName}>{s.name}</Text>
                {s.items.map((it, ii) => (
                  <View key={ii} style={styles.itemRow}>
                    <TextInput
                      value={it.name}
                      onChangeText={(t) => setItem(si, ii, { name: t })}
                      style={[styles.input, styles.itemName]}
                      placeholderTextColor={colors.textMutedLight}
                    />
                    <TextInput
                      value={it.price == null ? "" : String(it.price)}
                      onChangeText={(t) => {
                        const n = parseFloat(t.replace(/[^0-9.]/g, ""));
                        setItem(si, ii, { price: t.trim() === "" || Number.isNaN(n) ? null : n });
                      }}
                      keyboardType="decimal-pad"
                      placeholder="$"
                      placeholderTextColor={colors.textMutedLight}
                      style={[styles.input, styles.itemPrice]}
                    />
                    <Pressable onPress={() => removeItem(si, ii)}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))}
            {itemCount === 0 ? (
              <Text style={styles.muted}>Nothing readable came back. Retake the photo closer in.</Text>
            ) : null}
          </View>
          ) : null}

          {isEventy ? (
            <View style={styles.card}>
              <Text style={styles.label}>{events.length === 1 ? "The event" : "The events"}</Text>
              {events.length === 0 ? (
                <Text style={styles.muted}>
                  No events came back from the photo. Retake it, or pick a different type above.
                </Text>
              ) : null}
              {events.map((ev, ei) => (
                <View key={ei} style={styles.windowBlock}>
                  <TextInput
                    value={ev.title}
                    onChangeText={(t) =>
                      setEvents((es) => es.map((e, i) => (i === ei ? { ...e, title: t } : e)))
                    }
                    placeholder="Event name"
                    placeholderTextColor={colors.textMutedLight}
                    style={styles.input}
                  />
                  <Text style={styles.muted}>
                    {ev.is_recurring
                      ? `Every ${(ev.recurrence_dow ?? []).map((d) => DAY_NAMES[d]).join(", ") || "week"} at ${ev.start_time}`
                      : `${ev.date ?? "date needed"} at ${ev.start_time}`}
                    {ev.price_info ? ` · ${ev.price_info}` : ""}
                  </Text>
                  {!ev.is_recurring && !ev.date ? (
                    <Text style={styles.errorText}>
                      This one has no date. Remove it, or mark the board&apos;s date and rescan.
                    </Text>
                  ) : null}
                  <Pressable onPress={() => setEvents((es) => es.filter((_, i) => i !== ei))}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {!contextLoaded ? (
            <Pressable style={styles.secondaryBtn} onPress={retryContext}>
              <Text style={styles.secondaryBtnText}>Retry loading this venue</Text>
            </Pressable>
          ) : null}

          <Text style={styles.muted}>
            {(() => {
              const what = isHappyHour && isEventy ? "happy hour and events" : isEventy ? "events" : "happy hour";
              return canPublish
                ? `Submitting publishes the ${what} to your listing right away.`
                : `Submitting sends the ${what} to the venue's owner to approve. It stays hidden until they do.`;
            })()}
          </Text>

          <Pressable
            style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
            disabled={!canSubmit}
            onPress={submit}
          >
            <Text style={styles.primaryBtnText}>
              {submitting ? "Submitting…" : canPublish ? "Publish this menu" : "Send for approval"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert("Start over?", "Your edits to this scan will be lost.", [
                { text: "Keep editing", style: "cancel" },
                { text: "Start over", style: "destructive", onPress: startOver },
              ])
            }
          >
            <Text style={styles.linkText}>Retake the photo</Text>
          </Pressable>
        </>
      ) : null}

      {/* STEP 4 — done */}
      {step === "done" && outcome ? (
        <View style={styles.card}>
          <Text style={styles.h2}>
            {outcome.published ? "You're live" : "Sent for approval"}
          </Text>
          <Text style={styles.muted}>
            {outcome.published
              ? `${outcome.venueName}'s happy hour is updated and showing in the app.`
              : outcome.reviewRoute === "owner"
                ? `The team behind ${outcome.venueName} has been emailed. You'll hear back when they decide.`
                : `${outcome.venueName} has no owner on HappiTime yet, so our team will review it. You'll hear back either way.`}
          </Text>
          {outcome.unschedulable.length > 0 ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                We couldn&apos;t work out when {outcome.unschedulable.join(", ")}{" "}
                {outcome.unschedulable.length === 1 ? "happens" : "happen"}, so{" "}
                {outcome.unschedulable.length === 1 ? "it wasn't" : "they weren't"} added. Add{" "}
                {outcome.unschedulable.length === 1 ? "it" : "them"} by hand, or rescan with the
                date showing.
              </Text>
            </View>
          ) : null}
          <Pressable style={styles.primaryBtn} onPress={startOver}>
            <Text style={styles.primaryBtnText}>Scan another</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  h1: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  h2: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  muted: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  label: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputBad: { borderColor: colors.error },
  resultRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultName: { fontSize: 15, fontWeight: "600", color: colors.text },
  resultMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  preview: { width: "100%", height: 200, borderRadius: 8, marginTop: spacing.sm },
  busyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  windowBlock: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  matchNote: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  typeRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  typeRowOn: { borderColor: colors.primary, backgroundColor: colors.brandSubtle },
  typeTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  typeTitleOn: { color: colors.brandDark },
  typeHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  dowRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  dowChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dowChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dowChipText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  dowChipTextOn: { color: colors.surface },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timeInput: { width: 84, textAlign: "center" },
  sectionBlock: { marginTop: spacing.sm },
  sectionName: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  itemName: { flex: 1 },
  itemPrice: { width: 76, textAlign: "right" },
  removeText: { fontSize: 15, color: colors.error, fontWeight: "600", paddingHorizontal: spacing.xs },
  linkText: { fontSize: 14, color: colors.primary, fontWeight: "600", marginTop: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryBtnText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.45 },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 14 },
  noteBox: { backgroundColor: colors.cream, borderRadius: 8, padding: spacing.md, marginTop: spacing.lg },
  noteText: { color: colors.text, fontSize: 14 },
});
