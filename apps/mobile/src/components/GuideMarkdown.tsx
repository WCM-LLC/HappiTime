// src/components/GuideMarkdown.tsx
//
// A small markdown renderer for guide bodies — headings, paragraphs, bullet and
// numbered lists, bold/italic, links and images. Deliberately dependency-free so
// it ships over-the-air without a native rebuild. Venue links (the URL shapes
// guide_venue_slugs() matches) are routed to onVenuePress; everything else opens
// in the browser.

import React from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { venueSlugFromHref } from "../api/guides";

type Props = {
  body: string;
  onVenuePress?: (slug: string, href: string) => void;
};

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "img"; src: string; alt: string }
  | { kind: "hr" };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara(); flushList();
      blocks.push({ kind: "h", level: h[1].length, text: h[2].replace(/\s*#+$/, "") });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara(); flushList();
      blocks.push({ kind: "hr" });
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(trimmed);
    if (img) {
      flushPara(); flushList();
      blocks.push({ kind: "img", src: img[2], alt: img[1] });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      if (!list || list.kind !== "ul") { flushList(); list = { kind: "ul", items: [] }; }
      list.items.push(ul[1]);
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      if (!list || list.kind !== "ol") { flushList(); list = { kind: "ol", items: [] }; }
      list.items.push(ol[1]);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(trimmed);
    if (q) {
      flushPara(); flushList();
      blocks.push({ kind: "quote", text: q[1] });
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks;
}

type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };

// **bold**, *italic* / _italic_, [text](href), `code` (rendered plain).
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\)|`[^`]+`)/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1) });
    else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)/.exec(tok);
      if (lm) out.push({ text: lm[1], href: lm[2] });
      else out.push({ text: tok });
    } else out.push({ text: tok.slice(1, -1), italic: true });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function InlineText({ text, style, onVenuePress }: { text: string; style?: any; onVenuePress?: Props["onVenuePress"] }) {
  const parts = parseInline(text);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.href) {
          const slug = venueSlugFromHref(p.href);
          const onPress = () => {
            if (slug && onVenuePress) onVenuePress(slug, p.href!);
            else if (/^https?:\/\//i.test(p.href!)) void Linking.openURL(p.href!);
            else if (p.href!.startsWith("/")) void Linking.openURL(`https://www.happitime.biz${p.href}`);
          };
          return (
            <Text key={i} style={[styles.link, slug ? styles.venueLink : null]} onPress={onPress} accessibilityRole="link">
              {p.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={[p.bold ? styles.bold : null, p.italic ? styles.italic : null]}>
            {p.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function GuideMarkdown({ body, onVenuePress }: Props) {
  const blocks = React.useMemo(() => parseBlocks(body ?? ""), [body]);
  return (
    <View style={styles.root}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return <InlineText key={i} text={b.text} style={b.level <= 2 ? styles.h2 : styles.h3} onVenuePress={onVenuePress} />;
          case "p":
            return <InlineText key={i} text={b.text} style={styles.p} onVenuePress={onVenuePress} />;
          case "quote":
            return (
              <View key={i} style={styles.quote}>
                <InlineText text={b.text} style={styles.quoteText} onVenuePress={onVenuePress} />
              </View>
            );
          case "hr":
            return <View key={i} style={styles.hr} />;
          case "img":
            return /^https?:\/\//i.test(b.src) ? (
              <Image key={i} source={{ uri: b.src }} accessibilityLabel={b.alt} style={styles.img} resizeMode="cover" />
            ) : null;
          case "ul":
          case "ol":
            return (
              <View key={i} style={styles.list}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <Text style={styles.bullet}>{b.kind === "ul" ? "•" : `${j + 1}.`}</Text>
                    <InlineText text={it} style={[styles.p, styles.liText]} onVenuePress={onVenuePress} />
                  </View>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  h2: { fontSize: 20, fontWeight: "700", lineHeight: 26, color: colors.text, marginTop: 8 },
  h3: { fontSize: 17, fontWeight: "600", lineHeight: 22, color: colors.text, marginTop: 4 },
  p: { fontSize: 16, lineHeight: 25, color: colors.text },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  link: { color: colors.brandDark, textDecorationLine: "underline" },
  venueLink: { fontWeight: "600" },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.brandLight, paddingLeft: 12 },
  quoteText: { fontSize: 16, lineHeight: 25, color: colors.textMuted, fontStyle: "italic" },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
  img: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: colors.brandSubtle },
  list: { gap: 6 },
  li: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bullet: { fontSize: 16, lineHeight: 25, color: colors.brandDark, width: 18, textAlign: "right" },
  liText: { flex: 1 },
});
