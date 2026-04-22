import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_FILE_COUNT = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || Number.isNaN(port)) {
    throw new Error("Email service is not configured.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const files = formData.getAll("attachments").filter((value): value is File => value instanceof File);

    if (!subject) {
      return NextResponse.json({ error: "Subject is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json({ error: "Subject is too long." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }
    if (files.length > MAX_FILE_COUNT) {
      return NextResponse.json({ error: `You can attach up to ${MAX_FILE_COUNT} files.` }, { status: 400 });
    }

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const file of files) {
      if (!ACCEPTED_FILE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}` },
          { status: 400 },
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `${file.name} is too large. Max size is 5 MB per file.` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push({
        filename: file.name,
        content: buffer,
        contentType: file.type,
      });
    }

    const transport = getSmtpTransport();
    const now = new Date().toISOString();
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const referer = request.headers.get("referer") ?? "unknown";

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: "admin@happitime.biz",
      replyTo: process.env.SUPPORT_REPLY_TO ?? process.env.SMTP_USER,
      subject: `[HappiTime Support] ${subject}`,
      text: [
        `Subject: ${subject}`,
        `Timestamp: ${now}`,
        `Source app: directory (happitime.biz/contactus)`,
        `Referrer: ${referer}`,
        `User-Agent: ${userAgent}`,
        "",
        "Message:",
        message,
      ].join("\n"),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Support request send failed", error);
    return NextResponse.json(
      { error: "We could not send your request right now. Please try again shortly." },
      { status: 500 },
    );
  }
}
