import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendGuideSubmissionEmail({
  authorHandle,
  guideTitle,
  guideId,
}: {
  authorHandle: string;
  guideTitle: string;
  guideId: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — guide submission email skipped');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() ?? 'admin@happitime.biz';
  const consoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'https://happitime-console.vercel.app';

  await resend.emails.send({
    from: 'HappiTime <noreply@happitime.biz>',
    to: adminEmail,
    subject: `New Guide submission from @${authorHandle}: ${guideTitle}`,
    html: `
      <p>@${authorHandle} submitted a guide for review.</p>
      <p><strong>${guideTitle}</strong></p>
      <p><a href="${consoleUrl}/admin/guides?id=${guideId}">Review in Admin Console →</a></p>
    `.trim(),
  });
}

/**
 * Sends a venue owner a one-tap confirmation link for a drafted listing
 * captured via the field-intake flow.
 *
 * Returns:
 *   { sent: true }                     when Resend accepted the message
 *   { sent: false, reason: 'no_resend' }  when RESEND_API_KEY is not set
 *                                          (caller can fall back to copy-link)
 */
export async function sendVenueOwnerConfirmation(params: {
  to: string;
  venueName: string;
  claimUrl: string;
  /** Comma-separated window summary, e.g. "Mon-Fri 3-6pm, daily 9pm-12am". */
  windowSummary: string;
  /** Total menu items across all sections (used for "X items" copy in the email). */
  itemCount: number;
}): Promise<{ sent: boolean; reason?: 'no_resend' | 'send_failed'; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — owner confirmation email skipped');
    return { sent: false, reason: 'no_resend' };
  }

  const { to, venueName, claimUrl, windowSummary, itemCount } = params;
  try {
    await resend.emails.send({
      from: 'HappiTime <noreply@happitime.biz>',
      to,
      subject: `Confirm your HappiTime menu — ${venueName}`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:540px;margin:auto;padding:24px;">
          <h2 style="margin:0 0 12px;">Hi from HappiTime 👋</h2>
          <p>We just drafted your happy-hour menu for <strong>${venueName}</strong>.</p>
          <p>When it runs: <strong>${windowSummary}</strong></p>
          <p><strong>${itemCount}</strong> menu item${itemCount === 1 ? '' : 's'} captured.</p>
          <p style="margin:24px 0;">
            <a href="${claimUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
              Review &amp; publish →
            </a>
          </p>
          <p style="color:#555;font-size:13px;">If anything's wrong, you can edit it before publishing. This link expires in 14 days.</p>
        </div>
      `.trim(),
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: 'send_failed', error: err?.message ?? String(err) };
  }
}
