"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_FILE_COUNT = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
];

export default function ContactUsPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(() => {
    if (!subject.trim()) return "Subject is required.";
    if (!message.trim()) return "Message is required.";
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
    }
    if (files.length > MAX_FILE_COUNT) {
      return `You can attach up to ${MAX_FILE_COUNT} files.`;
    }

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        return `Unsupported file type: ${file.name}`;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return `${file.name} is too large. Max size is 5 MB per file.`;
      }
    }

    if (totalSize > MAX_FILE_COUNT * MAX_FILE_SIZE_BYTES) {
      return "Total attachment size is too large.";
    }

    return null;
  }, [subject, message, files]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (validationError) {
      setState("error");
      setError(validationError);
      return;
    }

    setState("loading");

    try {
      const formData = new FormData();
      formData.append("subject", subject.trim());
      formData.append("message", message.trim());
      for (const file of files) {
        formData.append("attachments", file);
      }

      const response = await fetch("/api/contact", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to send your message right now.");
      }

      setState("success");
      setSubject("");
      setMessage("");
      setFiles([]);
    } catch (submitError) {
      setState("error");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send your message right now. Please try again.",
      );
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
        Contact Support
      </h1>
      <p className="text-sm text-muted mb-8">
        Need help with HappiTime? Send us your question and our team will follow up.
      </p>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-5">
        <div>
          <label htmlFor="subject" className="mb-2 block text-sm font-medium text-foreground">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            maxLength={MAX_SUBJECT_LENGTH}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="Brief summary of your issue"
            required
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-foreground">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            maxLength={MAX_MESSAGE_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="Describe what happened, what you expected, and any helpful details."
            required
          />
        </div>

        <div>
          <label htmlFor="attachments" className="mb-2 block text-sm font-medium text-foreground">
            Attach files (optional)
          </label>
          <input
            id="attachments"
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES.join(",")}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, MAX_FILE_COUNT))}
            className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-brand-subtle"
          />
          <p className="mt-2 text-xs text-muted">
            Up to {MAX_FILE_COUNT} files. JPG, PNG, WEBP, PDF, or TXT. Max 5 MB each.
          </p>
          {files.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted space-y-1">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>{file.name}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? <p className="text-sm text-error">{error}</p> : null}
        {state === "success" ? (
          <p className="text-sm text-success">Your support request has been sent successfully.</p>
        ) : null}

        <button
          type="submit"
          disabled={state === "loading"}
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state === "loading" ? "Sending..." : "Send"}
        </button>
      </form>
    </main>
  );
}
