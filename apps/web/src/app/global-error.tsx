'use client';

// App-wide fallback. Catches errors that escape nested boundaries (including in
// the root layout). Must render its own <html>/<body>. Prevents fully blank pages.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
          maxWidth: 640,
          margin: '0 auto',
          color: '#111',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#555', marginBottom: 12 }}>An unexpected error occurred.</p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#fdecea',
            color: '#b3261e',
            padding: '0.75rem',
            borderRadius: 6,
            fontSize: 12,
            overflow: 'auto',
          }}
        >
          {error.message || 'Unknown error'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 12,
            padding: '0.5rem 1rem',
            borderRadius: 6,
            background: '#111',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
