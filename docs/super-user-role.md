# Super User Role — HappiTime

Super Users are trusted content creators — HappiTime Insiders — who can write and publish neighborhood guides directly from the admin console. They are distinct from Super Admins (platform operators) and from regular app users.

---

## Roles at a glance

| | Regular User | Super User | Super Admin |
|---|---|---|---|
| Uses the mobile app | ✓ | ✓ | ✓ |
| Visible badge in the app | — | ★ wine circle | — |
| Authors guides on console | — | ✓ | ✓ |
| Approves / rejects guides | — | — | ✓ |
| Manages other users | — | — | ✓ |
| Stored in | `user_profiles.role` | `user_profiles.role = 'super_user'` | `admin_users` table |

Super Admins are managed via the `admin_users` allowlist and are identified by email address. Super Users are promoted by a Super Admin from within the console.

---

## How Super Users log in

Super Users sign in at the **admin console** using the same email and password they use in the mobile app — there is no separate account.

**Console URL:** `https://happitime-console.vercel.app`

**Editor entry:** `https://happitime-console.vercel.app/dashboard/guides/new`

1. Go to the console URL and click **Super User Access**
2. Sign in with Apple, Google, or the email magic link associated with their HappiTime account
3. After sign-in they land on `/dashboard/guides/new`

> If a user tries to access `/dashboard/guides` without the Super User role, they are redirected to `/dashboard?error=not_authorized`.

---

## What Super Users can do

### Guide authoring (`/dashboard/guides/new`)

- **Create** a new guide from a markdown editor (title, subtitle, city, tags, body)
- **Save drafts** at any point — drafts are private and not visible on the directory
- **Edit** any of their own guides (draft, in review, or published)
- **Submit for review** — moves the guide to `pending_review` status and notifies the Super Admin by email
- **Delete** their own drafts

### Auto-publish (if enabled by Super Admin)

Super Users with `auto_publish_enabled = true` skip the review queue entirely — submitting a guide publishes it immediately on the public directory. This flag is set per-user by a Super Admin.

### In the mobile app

- Their profile shows a **★ wine-colored badge** (HappiTime Insider) wherever their name appears: activity feed, follower lists, search results, suggested people
- Their **public itineraries** surface in the Discover tab under "From HappiTime Insiders"
- Everything else in the app works identically to a regular user

---

## What Super Users cannot do

- Cannot access `/admin/*` (Users, Guides approval queue, Plans, etc.) — Super Admin only
- Cannot approve or reject other users' guides
- Cannot promote or demote other users
- Cannot edit or delete guides authored by other Super Users
- Cannot publish directly without Super Admin approval (unless `auto_publish_enabled` is set)
- Cannot see other users' private check-ins or draft content

---

## How Super Admins manage Super Users

In the console at `/admin/users`:

1. **Search** for a user by handle or display name
2. Click **Promote** to grant `role = 'super_user'` — they can now access `/dashboard/guides/new` immediately
3. Click **Revoke** to remove the role — they lose guide authoring access but keep their account
4. Toggle **Auto-publish** on or off per user — only visible for users who are already Super Users

---

## Guide lifecycle

```
Draft → [Submit] → Pending Review → [Approve] → Published
                                  → [Reject]  → Draft (with notes)
Published → [Unpublish] → Archived
```

- Super User controls: **Save draft**, **Submit**
- Super Admin controls: **Approve**, **Reject** (with notes back to author), **Unpublish**
- Published guides appear on the public directory at `happitime.com/guides/[slug]`
- Rejected guides return to Draft status with the Super Admin's notes visible to the author

---

## Granting the role (step by step)

1. Sign in to the console as a Super Admin
2. Go to **Admin → Users**
3. Search for the user's handle (they must have completed mobile onboarding and set a handle)
4. Click **Promote to Super User**
5. Optionally toggle **Auto-publish** if they are a trusted author who doesn't need review
6. The user will see the Guides section on their next console visit — no app update or re-login required
