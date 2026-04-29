/**
 * HOME PAGE
 * =========
 * When NEXT_PUBLIC_COMING_SOON=true → shows the pre-launch splash page.
 * When not set or false → shows the full live directory homepage.
 *
 * To switch modes:
 *   1. Set the env var in Vercel (Settings → Environment Variables)
 *   2. Redeploy
 */
import { redirect } from "next/navigation";
import ComingSoon from "./coming-soon";


export default function HomePage() {
  if (process.env.NEXT_PUBLIC_COMING_SOON === "true") {
    return <ComingSoon />;
  }
  redirect("/kc/");
}
