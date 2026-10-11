import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/seoText";
import { jsonLdHtml, webPageJsonLd } from "@/lib/structuredData";

// The page itself is a client component (it reads ?plan= for venue leads), so
// its metadata and page markup live here on the server.
const TITLE = "Contact HappiTime — Talk to a Person";
const DESCRIPTION =
  "Questions about HappiTime, a listing that looks wrong, or getting your Kansas City venue on the app? Send a message and a person will reply.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | HappiTime` },
  description: DESCRIPTION,
  alternates: { canonical: "/contactus/" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: TITLE,
    description: DESCRIPTION,
    url: "https://happitime.biz/contactus/",
    type: "website",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(
          webPageJsonLd({
            type: "ContactPage",
            name: TITLE,
            url: "https://happitime.biz/contactus/",
            description: DESCRIPTION,
          }),
        )}
      />
      {children}
    </>
  );
}
