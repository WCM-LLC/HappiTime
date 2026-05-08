import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type VenueRow = {
  id: string;
  name: string | null;
  org_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  places_attempts: number | null;
  places_id: string | null;
  places_status: string | null;
  is_verified: boolean | null;
};

type PlacesPhoto = {
  name?: string;
};

type PlacesAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlacesLocation = {
  latitude?: number;
  longitude?: number;
};

type PlacesPlace = {
  id?: string;
  types?: string[];
  photos?: PlacesPhoto[];
  priceLevel?: string | null;
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  location?: PlacesLocation;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
};

type PlacesSearchResponse = {
  places?: PlacesPlace[];
};

type PlacesResult<T> = {
  ok: boolean;
  errorMessage: string | null;
  retryable: boolean;
  result?: T;
};

type MediaUpload = {
  path: string;
  sortOrder: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const placesKey =
  Deno.env.get("GOOGLE_PLACES_API_KEY") ??
  Deno.env.get("GOOGLE_GEOCODING_API_KEY") ??
  "";

const batchLimit = Number(Deno.env.get("PLACES_BATCH_LIMIT") ?? "5");
const maxAttempts = Number(Deno.env.get("PLACES_MAX_ATTEMPTS") ?? "4");

const cloudinaryCloud = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "dhucspghz";
const cloudinaryPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET") ?? "happitime_venue_media";
const retryMinutes = Number(Deno.env.get("PLACES_RETRY_MINUTES") ?? "60");
const refreshDays = Number(Deno.env.get("PLACES_REFRESH_DAYS") ?? "30");
const maxPhotos = Number(Deno.env.get("PLACES_MAX_PHOTOS") ?? "6");

if (!supabaseUrl || !serviceKey || !placesKey) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or Google Places API key."
  );
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

const retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);
const placesApiBaseUrl = "https://places.googleapis.com/v1";
const placesSearchFieldMask =
  "places.id,places.types,places.photos,places.priceLevel";
const placesDetailsFieldMask =
  "id,types,photos,priceLevel,formattedAddress,addressComponents,location,websiteUri,nationalPhoneNumber,internationalPhoneNumber";

const ignoredTypes = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "restaurant"
]);

const orgNameFallbacks = new Set([
  "lee's summit",
  "leawood",
  "blue springs",
  "gladstone",
  "northland",
  "plaza"
]);

const typeOverrides: Record<string, string> = {
  bar: "bar",
  cafe: "cafe",
  bakery: "bakery",
  brewery: "brewery",
  night_club: "nightlife",
  meal_takeaway: "takeout",
  meal_delivery: "delivery",
  coffee_shop: "coffee",
  wine_bar: "wine_bar",
  cocktail_bar: "cocktail_bar",
  sports_bar: "sports_bar",
  ice_cream_shop: "ice_cream",
  dessert_shop: "dessert",
  sandwich_shop: "sandwiches",
  pizza_restaurant: "pizza",
  burger_restaurant: "burgers",
  fast_food_restaurant: "fast_food",
  steak_house: "steakhouse",
  seafood_restaurant: "seafood",
  sushi_restaurant: "sushi",
  ramen_restaurant: "ramen",
  taco_restaurant: "tacos",
  breakfast_restaurant: "breakfast",
  vegetarian_restaurant: "vegetarian",
  vegan_restaurant: "vegan",
  mediterranean_restaurant: "mediterranean",
  middle_eastern_restaurant: "middle_eastern",
  mexican_restaurant: "mexican",
  italian_restaurant: "italian",
  chinese_restaurant: "chinese",
  japanese_restaurant: "japanese",
  korean_restaurant: "korean",
  thai_restaurant: "thai",
  indian_restaurant: "indian",
  french_restaurant: "french",
  spanish_restaurant: "spanish",
  greek_restaurant: "greek",
  vietnamese_restaurant: "vietnamese",
  lebanese_restaurant: "lebanese",
  brazilian_restaurant: "brazilian",
  peruvian_restaurant: "peruvian",
  caribbean_restaurant: "caribbean",
  african_restaurant: "african",
  american_restaurant: "american",
  barbecue_restaurant: "bbq"
};

const normalizePart = (part: string | number | null | undefined) => {
  if (part == null) return "";
  if (typeof part === "number") {
    if (!Number.isFinite(part) || part === 0) return "";
    return String(part).trim();
  }
  const text = String(part).trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "0") {
    return "";
  }
  return text;
};

const normalizeZip = (zip: string) => {
  const normalized = normalizePart(zip);
  if (!normalized) return "";
  return normalized.replace(/\s+/g, " ").trim();
};

const shouldUseOrgNameFallback = (venue: VenueRow) => {
  const name = normalizePart(venue.name).toLowerCase();
  return name.length > 0 && orgNameFallbacks.has(name);
};

const buildSearchText = (venue: VenueRow) => {
  const parts: string[] = [];
  const namePart = normalizePart(venue.name);
  const orgPart = normalizePart(venue.org_name);

  if (shouldUseOrgNameFallback(venue) && orgPart) {
    parts.push(orgPart);
  }
  if (namePart && !parts.includes(namePart)) {
    parts.push(namePart);
  }

  for (const part of [
    venue.address,
    venue.city,
    venue.state,
    venue.zip
  ]) {
    const normalized = normalizePart(part);
    if (normalized && !parts.includes(normalized)) {
      parts.push(normalized);
    }
  }

  return parts.join(", ");
};

const isMissingText = (value: string | number | null | undefined) =>
  normalizePart(value).length === 0;

const getComponent = (
  components: PlacesAddressComponent[] | undefined,
  type: string
) => components?.find((component) => component.types?.includes(type));

const getComponentText = (
  components: PlacesAddressComponent[] | undefined,
  type: string,
  preferShort = false
) => {
  const component = getComponent(components, type);
  if (!component) return "";
  const primary = preferShort ? component.shortText : component.longText;
  const fallback = preferShort ? component.longText : component.shortText;
  return normalizePart(primary ?? fallback ?? "");
};

const buildStreetAddress = (
  components: PlacesAddressComponent[] | undefined
) => {
  const streetNumber = getComponentText(components, "street_number");
  const route = getComponentText(components, "route");
  const premise = getComponentText(components, "premise");
  const subpremise = getComponentText(components, "subpremise");
  let address = [streetNumber, route].filter(Boolean).join(" ");
  if (!address && premise) {
    address = premise;
  }
  if (address && subpremise) {
    address = `${address} #${subpremise}`;
  }
  return address;
};

const getCity = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, "locality") ||
  getComponentText(components, "postal_town") ||
  getComponentText(components, "sublocality_level_1") ||
  getComponentText(components, "administrative_area_level_2");

const getState = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, "administrative_area_level_1", true);

const getZip = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, "postal_code");

const buildVenueUpdatesFromPlace = (venue: VenueRow, place: PlacesPlace) => {
  const updates: Record<string, unknown> = {};
  const components = place.addressComponents;
  const address = buildStreetAddress(components);
  const city = getCity(components);
  const state = getState(components);
  const zip = normalizeZip(getZip(components));
  const phone = normalizePart(
    place.nationalPhoneNumber ?? place.internationalPhoneNumber
  );
  const website = normalizePart(place.websiteUri);

  if (address && isMissingText(venue.address)) {
    updates.address = address;
  }
  if (city && isMissingText(venue.city)) {
    updates.city = city;
  }
  if (state && isMissingText(venue.state)) {
    updates.state = state;
  }
  if (zip && isMissingText(venue.zip)) {
    updates.zip = zip;
  }
  if (phone && isMissingText(venue.phone)) {
    updates.phone = phone;
  }
  if (website && isMissingText(venue.website)) {
    updates.website = website;
  }

  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if ((venue.lat == null || venue.lng == null) &&
    typeof lat === "number" &&
    typeof lng === "number") {
    if (venue.lat == null) updates.lat = lat;
    if (venue.lng == null) updates.lng = lng;
  }

  return updates;
};

const needsDetails = (venue: VenueRow) =>
  isMissingText(venue.address) ||
  isMissingText(venue.city) ||
  isMissingText(venue.state) ||
  isMissingText(venue.zip) ||
  isMissingText(venue.phone) ||
  isMissingText(venue.website) ||
  venue.lat == null ||
  venue.lng == null;

const getJobToken = async () => {
  const { data, error } = await supabase.rpc("get_places_job_token");

  if (error) {
    return { token: null, error: error.message };
  }

  const token = data ?? null;
  return { token, error: null };
};

const getNextAttemptAt = (now: Date) =>
  new Date(now.getTime() + retryMinutes * 60 * 1000).toISOString();

const getNextSyncAt = (now: Date) =>
  refreshDays > 0
    ? new Date(now.getTime() + refreshDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

const mapTypesToTags = (types: string[]) => {
  const tags = new Set<string>();
  for (const rawType of types ?? []) {
    const type = rawType?.trim().toLowerCase();
    if (!type || ignoredTypes.has(type)) continue;
    if (typeOverrides[type]) {
      tags.add(typeOverrides[type]);
      continue;
    }
    if (type.endsWith("_restaurant")) {
      tags.add(type.replace(/_restaurant$/, ""));
      continue;
    }
    if (type.endsWith("_bar")) {
      tags.add(type);
    }
  }
  return Array.from(tags);
};

const mapPriceTier = (priceLevel?: string | number | null) => {
  if (typeof priceLevel === "number") return priceLevel;
  switch ((priceLevel ?? "").toUpperCase()) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
};

const buildPlacesHeaders = (fieldMask: string) => ({
  "Content-Type": "application/json",
  "X-Goog-Api-Key": placesKey,
  "X-Goog-FieldMask": fieldMask
});

const fetchPlacesJson = async <T>(
  url: string,
  init: RequestInit
): Promise<PlacesResult<T>> => {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      `Places request failed with ${response.status}.`;
    return {
      ok: false,
      errorMessage: message,
      retryable: retryableStatusCodes.has(response.status)
    };
  }

  if (!payload) {
    return {
      ok: false,
      errorMessage: "Places response was empty.",
      retryable: true
    };
  }

  return {
    ok: true,
    errorMessage: null,
    retryable: false,
    result: payload as T
  };
};

const searchPlace = async (
  venue: VenueRow
): Promise<PlacesResult<PlacesPlace>> => {
  const input = buildSearchText(venue);
  const body: Record<string, unknown> = { textQuery: input };

  if (venue.lat != null && venue.lng != null) {
    body.locationBias = {
      circle: {
        center: {
          latitude: venue.lat,
          longitude: venue.lng
        },
        radius: 5000
      }
    };
  }

  const result = await fetchPlacesJson<PlacesSearchResponse>(
    `${placesApiBaseUrl}/places:searchText`,
    {
      method: "POST",
      headers: buildPlacesHeaders(placesSearchFieldMask),
      body: JSON.stringify(body)
    }
  );

  if (!result.ok) {
    return result as PlacesResult<PlacesPlace>;
  }

  const place = result.result?.places?.[0];
  if (!place?.id) {
    return {
      ok: false,
      errorMessage: "No Places match returned.",
      retryable: false
    };
  }

  return {
    ok: true,
    errorMessage: null,
    retryable: false,
    result: place
  };
};

const fetchPlaceDetails = async (
  placeId: string
): Promise<PlacesResult<PlacesPlace>> => {
  const result = await fetchPlacesJson<PlacesPlace>(
    `${placesApiBaseUrl}/places/${placeId}`,
    {
      method: "GET",
      headers: buildPlacesHeaders(placesDetailsFieldMask)
    }
  );

  if (!result.ok) {
    return result;
  }

  const details = result.result;
  if (!details?.id) {
    return {
      ok: false,
      errorMessage: "No Places details returned.",
      retryable: false
    };
  }

  return result;
};

const getPhotoExtension = (contentType: string) => {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  return "jpg";
};

const getPhotoFileBase = (photoName: string, index: number) => {
  const base = photoName.split("/").pop() || `photo-${index + 1}`;
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
};

const downloadPlacePhoto = async (photoName: string) => {
  const normalizedName = photoName.replace(/^\/+/, "");
  const url = new URL(`${placesApiBaseUrl}/${normalizedName}/media`);
  url.searchParams.set("maxHeightPx", "1600");
  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "X-Goog-Api-Key": placesKey
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: `Photo request failed with ${response.status}.`
    };
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return {
      ok: false,
      errorMessage: `Photo response was ${contentType || "not an image"}.`
    };
  }

  const data = new Uint8Array(await response.arrayBuffer());
  return {
    ok: true,
    contentType,
    data,
    extension: getPhotoExtension(contentType)
  };
};

const refreshVenueMedia = async (
  venueId: string,
  photoNames: string[]
) => {
  const errors: string[] = [];

  // 1. Clean up legacy Supabase Storage files (rows migrated before this change).
  const legacyPrefix = `places/${venueId}`;
  const { data: legacyFiles } = await supabase.storage
    .from("venue-media")
    .list(legacyPrefix, { limit: 1000 });
  const legacyPaths = legacyFiles?.map((f) => `${legacyPrefix}/${f.name}`) ?? [];
  if (legacyPaths.length > 0) {
    await supabase.storage.from("venue-media").remove(legacyPaths);
  }
  await supabase.from("venue_media").delete()
    .eq("venue_id", venueId)
    .eq("storage_bucket", "venue-media")
    .ilike("storage_path", `${legacyPrefix}/%`);

  // 2. Delete existing Cloudinary rows for this venue from Google Places.
  const { error: deleteError } = await supabase
    .from("venue_media")
    .delete()
    .eq("venue_id", venueId)
    .eq("storage_bucket", "cloudinary")
    .eq("title", "Google Places");

  if (deleteError) {
    errors.push(`Delete metadata: ${deleteError.message}`);
  }

  // 3. Upload fresh photos to Cloudinary.
  const uploads: MediaUpload[] = [];
  for (const [index, photoName] of photoNames.entries()) {
    let photo: Awaited<ReturnType<typeof downloadPlacePhoto>>;
    try {
      photo = await downloadPlacePhoto(photoName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Photo ${index + 1}: ${message}`);
      continue;
    }

    if (!photo.ok) {
      errors.push(photo.errorMessage ?? `Photo ${index + 1} failed.`);
      continue;
    }

    const publicId = `happitime/venues/${venueId}/${crypto.randomUUID()}`;
    const formData = new FormData();
    formData.append("file", new Blob([photo.data], { type: photo.contentType }));
    formData.append("upload_preset", cloudinaryPreset);
    formData.append("public_id", publicId);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryCloud}/image/upload`,
      { method: "POST", body: formData }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      errors.push(`Upload photo ${index + 1}: ${text}`);
      continue;
    }

    uploads.push({ path: publicId, sortOrder: index });
  }

  if (uploads.length > 0) {
    const { error: insertError } = await supabase.from("venue_media").insert(
      uploads.map((upload) => ({
        venue_id: venueId,
        type: "image",
        status: "published",
        title: "Google Places",
        source: "google_places",
        storage_bucket: "cloudinary",
        storage_path: upload.path,
        sort_order: upload.sortOrder
      }))
    );

    if (insertError) {
      errors.push(`Insert metadata: ${insertError.message}`);
    }
  }

  return {
    uploadedCount: uploads.length,
    errorMessage: errors.length > 0 ? errors.join(" ") : null
  };
};

serve(async (req) => {
  try {
    const providedToken = req.headers.get("x-places-token") ?? "";
    if (!providedToken) {
      return new Response("Missing places token.", { status: 401 });
    }

    const { token: expectedToken, error: tokenError } = await getJobToken();
    if (tokenError) {
      return new Response(`Failed to read places token: ${tokenError}`, {
        status: 500
      });
    }
    if (!expectedToken) {
      return new Response("Places token not configured.", { status: 500 });
    }
    if (providedToken !== expectedToken) {
      return new Response("Invalid places token.", { status: 401 });
    }

    const url = new URL(req.url);
    const debugMode = url.searchParams.get("debug") === "1";
    const limitParam = url.searchParams.get("limit");
    const limit = Math.max(
      1,
      Math.min(Number(limitParam ?? batchLimit), batchLimit)
    );
    const now = new Date();
    const nowIso = now.toISOString();

    // DATA PROTECTION: never enrich verified venues. Curated data is the
    // source of truth — pulls only enrich rows that haven't been hand-confirmed.
    // Re-verify manually (set is_verified=false) if you want a row re-enriched.
    const { data: venues, error } = await supabase
      .from("venues")
      .select(
        "id,name,org_name,address,city,state,zip,lat,lng,phone,website,places_attempts,places_id,places_status,is_verified"
      )
      .eq("is_verified", false)
      .in("places_status", ["pending", "success"])
      .lte("places_next_sync_at", nowIso)
      .order("places_next_sync_at", { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!venues || venues.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let verifiedSkippedCount = 0;

    for (const venue of venues as VenueRow[]) {
      // Defense-in-depth: even though the SELECT already filters verified
      // venues, recheck here in case the flag flipped between fetch and write.
      if (venue.is_verified === true) {
        verifiedSkippedCount += 1;
        continue;
      }
      const attempts = (venue.places_attempts ?? 0) + 1;
      const hasName = normalizePart(venue.name).length > 0;
      const hasAddress =
        normalizePart(venue.address).length > 0 ||
        normalizePart(venue.city).length > 0 ||
        normalizePart(venue.state).length > 0 ||
        normalizePart(venue.zip).length > 0;

      if (!venue.places_id && !hasName && !hasAddress) {
        const { error: updateError } = await supabase
          .from("venues")
          .update({
            places_status: "skipped",
            places_last_error: "Missing name/address fields.",
            places_attempts: attempts,
            places_next_sync_at: null
          })
          .eq("id", venue.id);

        if (!updateError) skippedCount += 1;
        continue;
      }

      if (attempts > maxAttempts) {
        const { error: updateError } = await supabase
          .from("venues")
          .update({
            places_status: "failed",
            places_last_error: "Max attempts reached.",
            places_attempts: attempts,
            places_next_sync_at: null
          })
          .eq("id", venue.id);

        if (!updateError) failureCount += 1;
        continue;
      }

      let placeId = (venue.places_id ?? "").trim();
      let place: PlacesPlace | null = null;

      if (placeId) {
        const detailsResult = await fetchPlaceDetails(placeId);
        if (detailsResult.ok && detailsResult.result?.id) {
          place = detailsResult.result;
        } else if (detailsResult.retryable) {
          const retryable = attempts < maxAttempts;
          const nextAttemptAt = retryable ? getNextAttemptAt(now) : null;
          const status = retryable ? "pending" : "failed";
          const { error: updateError } = await supabase
            .from("venues")
            .update({
              places_status: status,
              places_last_error:
                detailsResult.errorMessage ?? "Places details failed.",
              places_attempts: attempts,
              places_next_sync_at: nextAttemptAt
            })
            .eq("id", venue.id);

          if (!updateError) failureCount += 1;
          continue;
        }
      }

      if (!place) {
        const searchText = buildSearchText(venue);
        if (!searchText) {
          const { error: updateError } = await supabase
            .from("venues")
            .update({
              places_status: "skipped",
              places_last_error: "Missing address search text.",
              places_attempts: attempts,
              places_next_sync_at: null
            })
            .eq("id", venue.id);

          if (!updateError) skippedCount += 1;
          continue;
        }

        const searchResult = await searchPlace(venue);
        if (!searchResult.ok || !searchResult.result?.id) {
          const retryable = searchResult.retryable && attempts < maxAttempts;
          const nextAttemptAt = retryable ? getNextAttemptAt(now) : null;
          const status = retryable ? "pending" : "failed";
          const { error: updateError } = await supabase
            .from("venues")
            .update({
              places_status: status,
              places_last_error:
                searchResult.errorMessage ?? "Places search failed.",
              places_attempts: attempts,
              places_next_sync_at: nextAttemptAt
            })
            .eq("id", venue.id);

          if (!updateError) failureCount += 1;
          continue;
        }

        place = searchResult.result;
        placeId = place.id ?? "";
      }

      if (
        place &&
        placeId &&
        needsDetails(venue) &&
        !place.addressComponents &&
        !place.location &&
        !place.websiteUri &&
        !place.nationalPhoneNumber &&
        !place.internationalPhoneNumber
      ) {
        const detailsResult = await fetchPlaceDetails(placeId);
        if (detailsResult.ok && detailsResult.result?.id) {
          place = detailsResult.result;
        } else if (detailsResult.retryable) {
          const retryable = attempts < maxAttempts;
          const nextAttemptAt = retryable ? getNextAttemptAt(now) : null;
          const status = retryable ? "pending" : "failed";
          const { error: updateError } = await supabase
            .from("venues")
            .update({
              places_status: status,
              places_last_error:
                detailsResult.errorMessage ?? "Places details failed.",
              places_attempts: attempts,
              places_next_sync_at: nextAttemptAt
            })
            .eq("id", venue.id);

          if (!updateError) failureCount += 1;
          continue;
        }
      }

      if (!place) {
        const { error: updateError } = await supabase
          .from("venues")
          .update({
            places_status: "failed",
            places_last_error: "Places lookup failed.",
            places_attempts: attempts,
            places_next_sync_at: null
          })
          .eq("id", venue.id);

        if (!updateError) failureCount += 1;
        continue;
      }

      const tags = mapTypesToTags(place.types ?? []);
      const priceTier = mapPriceTier(place.priceLevel);

      const photoNames = (place.photos ?? [])
        .map((photo) => photo.name)
        .filter((name): name is string => Boolean(name))
        .slice(0, Math.max(0, maxPhotos));

      let mediaResult: Awaited<ReturnType<typeof refreshVenueMedia>>;
      try {
        mediaResult = await refreshVenueMedia(venue.id, photoNames);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        mediaResult = {
          uploadedCount: 0,
          errorMessage: `Refresh media: ${message}`
        };
      }

      const mediaError = mediaResult.errorMessage;
      const retryable = Boolean(mediaError) && attempts < maxAttempts;
      const status = mediaError ? (retryable ? "pending" : "failed") : "success";
      const nextSyncAt =
        status === "success"
          ? getNextSyncAt(now)
          : retryable
            ? getNextAttemptAt(now)
            : null;

      const updatePayload: Record<string, unknown> = {
        places_id: placeId,
        places_status: status,
        places_last_error: mediaError,
        places_attempts: status === "success" ? 0 : attempts,
        places_next_sync_at: nextSyncAt,
        tags,
        price_tier: priceTier
      };

      Object.assign(updatePayload, buildVenueUpdatesFromPlace(venue, place));

      if (status === "success") {
        updatePayload.places_last_synced_at = nowIso;
      }

      const { error: updateError } = await supabase
        .from("venues")
        .update(updatePayload)
        .eq("id", venue.id);

      if (updateError) {
        if (debugMode) {
          return new Response(
            JSON.stringify({
              error: updateError.message,
              stage: "update",
              venueId: venue.id
            }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
        failureCount += 1;
        continue;
      }

      if (status === "success") {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    return new Response(
      JSON.stringify({
        processed: venues.length,
        success: successCount,
        failed: failureCount,
        skipped: skippedCount,
        verified_skipped: verifiedSkippedCount
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});
