import { redirect } from "next/navigation";

/**
 * The opener briefly lived here while `/` still redirected to /kc/. It is the
 * front door now, so /start folds into it rather than serving the same page at
 * two URLs. Kept as a temporary redirect, not permanent: /start was noindexed
 * for its whole life, so there is no ranking to consolidate, and a 308 would be
 * cached hard by browsers if the route is ever wanted back.
 */
export default function StartPage() {
  redirect("/");
}
