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
