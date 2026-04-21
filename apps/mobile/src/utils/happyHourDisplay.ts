type DisplayVenue = {
  name?: string | null;
  org_name?: string | null;
  app_name_preference?: string | null;
};

type DisplayWindow = {
  name?: string | null;
  org_name?: string | null;
  app_name_preference?: string | null;
  organization_name?: string | null;
  orgName?: string | null;
  venue_name?: string | null;
  label?: string | null;
  venue?: DisplayVenue | null;
};

const normalizeText = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value) => Boolean(value)) ?? null;

export const getHappyHourDisplayNames = (window?: DisplayWindow | null) => {
  const venue = window?.venue ?? null;
  const placeName = normalizeText(window?.name);
  const venueName = firstNonEmpty(
    normalizeText(window?.venue_name),
    normalizeText(venue?.name),
    placeName
  );
  const orgNameFromWindow = firstNonEmpty(
    normalizeText(window?.organization_name),
    normalizeText(window?.orgName),
    normalizeText(window?.org_name)
  );
  const orgNameFromVenue = normalizeText(venue?.org_name);
  const orgName = firstNonEmpty(orgNameFromWindow, orgNameFromVenue);
  const label = normalizeText(window?.label);
  const preference = firstNonEmpty(
    normalizeText(window?.app_name_preference),
    normalizeText(venue?.app_name_preference)
  );
  const preferenceLower = preference?.toLowerCase() ?? null;

  let titleText = firstNonEmpty(orgName, venueName, label) ?? "Happy Hour";

  if (preferenceLower === "venue" && venueName) {
    titleText = venueName;
  } else if (preferenceLower === "org" && orgName) {
    titleText = orgName;
  }

  const subtitleText = venueName && venueName !== titleText ? venueName : null;

  return {
    titleText,
    subtitleText,
    venueName,
    orgName,
    label,
  };
};
