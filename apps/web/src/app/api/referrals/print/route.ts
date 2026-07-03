import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';
import { renderReferralQrPng } from '@happitime/venue-qr';
import {
  INTER_BOLD_TTF_BASE64,
  INTER_REGULAR_TTF_BASE64,
  PLUS_JAKARTA_BOLD_TTF_BASE64,
} from './fonts';

// Self-only print-ready PDFs for a Super User's attribution QR.
//   ?format=card      → 4×6" card (portrait) — handout / post at the bar
//   ?format=stickers  → US-letter sheet of six 2.5" stickers with cut guides
// Handle is always the caller's own (forge-proof, mirrors /api/referrals/qr).
// pngjs + pdf-lib need Node APIs — Node.js runtime, not edge.
export const runtime = 'nodejs';

const PT_PER_IN = 72;

// Brand tokens (HappiTime design system — colors_and_type.css)
const BRAND = rgb(0xc8 / 255, 0x96 / 255, 0x5a / 255); // Golden Hour
const DARK = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255);
const MUTED = rgb(0x6b / 255, 0x6b / 255, 0x6b / 255);
const CREAM = rgb(0xf5 / 255, 0xf0 / 255, 0xeb / 255);
const WHITE = rgb(1, 1, 1);
const HAIRLINE = rgb(0xd0 / 255, 0xc8 / 255, 0xbc / 255);

// Brand fonts, ASCII-subset (~10KB each — see fonts.ts). Plus Jakarta Sans is
// wordmark-only per the design system; Inter carries all other copy.
type BrandFonts = { wordmark: PDFFont; bold: PDFFont; regular: PDFFont };

async function embedBrandFonts(doc: PDFDocument): Promise<BrandFonts> {
  doc.registerFontkit(fontkit);
  const [wordmark, bold, regular] = await Promise.all([
    doc.embedFont(Buffer.from(PLUS_JAKARTA_BOLD_TTF_BASE64, 'base64'), { subset: true }),
    doc.embedFont(Buffer.from(INTER_BOLD_TTF_BASE64, 'base64'), { subset: true }),
    doc.embedFont(Buffer.from(INTER_REGULAR_TTF_BASE64, 'base64'), { subset: true }),
  ]);
  return { wordmark, bold, regular };
}

function centerText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  cx?: number,
) {
  const x = (cx ?? page.getWidth() / 2) - font.widthOfTextAtSize(text, size) / 2;
  page.drawText(text, { x, y, size, font, color });
}

async function buildCardPdf(handle: string, qrPng: Buffer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([4 * PT_PER_IN, 6 * PT_PER_IN]); // 288 × 432 pt
  const { wordmark, bold, regular } = await embedBrandFonts(doc);
  const qr = await doc.embedPng(qrPng);

  const W = page.getWidth();
  const H = page.getHeight();

  // Cream bleed + white inner card
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({
    x: 14,
    y: 14,
    width: W - 28,
    height: H - 28,
    color: WHITE,
    borderColor: HAIRLINE,
    borderWidth: 0.75,
  });

  // Brand eyebrow (wordmark face) + one-line centered title
  centerText(page, 'HAPPITIME', H - 52, wordmark, 11, BRAND);
  centerText(page, 'Scan for my happy hour picks', H - 78, bold, 15, DARK);

  // QR — 2.5" centered
  const qrSize = 2.5 * PT_PER_IN;
  page.drawImage(qr, {
    x: (W - qrSize) / 2,
    y: (H - qrSize) / 2 - 18,
    width: qrSize,
    height: qrSize,
  });

  // Handle
  centerText(page, `@${handle}`, (H - qrSize) / 2 - 46, bold, 14, BRAND);

  // Slim footer
  centerText(page, `happitime.biz/r/${handle}`, 30, regular, 8.5, MUTED);

  return doc.save();
}

async function buildStickerSheetPdf(handle: string, qrPng: Buffer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([8.5 * PT_PER_IN, 11 * PT_PER_IN]); // US letter
  const { bold } = await embedBrandFonts(doc);
  const qr = await doc.embedPng(qrPng);

  const W = page.getWidth();
  const H = page.getHeight();
  const cols = 2;
  const rows = 3;
  const margin = 0.5 * PT_PER_IN;
  const cellW = (W - margin * 2) / cols;
  const cellH = (H - margin * 2) / rows;
  const qrSize = 2.5 * PT_PER_IN;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = margin + c * cellW + cellW / 2;
      const cyTop = H - margin - r * cellH; // top edge of the cell

      // Cut guide: hairline rounded-feel rect inset in the cell
      const guideW = qrSize + 36;
      const guideH = qrSize + 58;
      page.drawRectangle({
        x: cx - guideW / 2,
        y: cyTop - (cellH + guideH) / 2,
        width: guideW,
        height: guideH,
        borderColor: HAIRLINE,
        borderWidth: 0.5,
        color: WHITE,
      });

      const qrY = cyTop - (cellH - guideH) / 2 - 14 - qrSize;
      page.drawImage(qr, { x: cx - qrSize / 2, y: qrY, width: qrSize, height: qrSize });
      centerText(page, `@${handle}`, qrY - 18, bold, 11, BRAND, cx);
    }
  }

  return doc.save();
}

export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get('format') ?? 'card';
  if (format !== 'card' && format !== 'stickers') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('handle, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String((profile as any)?.role ?? '');
  if (role !== 'super_user' && !(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const handle = String((profile as any)?.handle ?? '').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(handle)) {
    return NextResponse.json({ error: 'Set a handle in the app first' }, { status: 422 });
  }

  // 750px = 2.5" at 300 DPI — matches the largest size either layout prints.
  const qrPng = await renderReferralQrPng(handle, { size: 750 });
  const pdf =
    format === 'card'
      ? await buildCardPdf(handle, qrPng)
      : await buildStickerSheetPdf(handle, qrPng);

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="happitime-${handle}-${format}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
