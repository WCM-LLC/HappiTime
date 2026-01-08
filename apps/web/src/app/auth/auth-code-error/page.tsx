export default function AuthCodeErrorPage() {
  return (
    <main className="container">
      <div className="col" style={{ gap: 12, maxWidth: 720 }}>
        <h1 style={{ marginBottom: 0 }}>Login failed</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          This usually means your OAuth redirect URL is not allow-listed in Supabase Auth settings.
        </p>
        <div className="card">
          <ol className="col" style={{ gap: 8, margin: 0, paddingLeft: 18 }}>
            <li>In Supabase Dashboard → Authentication → URL Configuration, add your site URL.</li>
            <li>In Authentication → Redirect URLs, allow <code>/auth/callback</code> for local + prod.</li>
            <li>Try logging in again.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
