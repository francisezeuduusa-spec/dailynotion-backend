# DailyNotion — Full Dashboard Spec
## Every page. Every word. Every button. Every state.

---

## GOOGLE AUTH — HOW IT WORKS (Frontend side)

### "Continue with Google" button
Add this button to BOTH /signup and /login pages, above the email/password form with a divider that says "or".

Button text: "Continue with Google"  
Button has the Google G logo on the left side.

**What happens when clicked:**  
Redirect the browser to: `GET https://your-backend.onrender.com/api/auth/google`  
The backend handles everything and redirects back to:  
`/auth/google/success?accessToken=...&refreshToken=...&redirectTo=...`

**You need to create this one frontend page:**

### Page: /auth/google/success
This page is never seen by the user — it's a silent handler.  
When it loads, it does this:
1. Reads `accessToken`, `refreshToken`, `redirectTo` from the URL query params
2. Stores `accessToken` and `refreshToken` in your auth state (same as email login)
3. Immediately navigates to `redirectTo`
4. If any param is missing, navigate to `/login?error=google_failed`

**Error handling on /login and /signup:**  
If URL has `?error=google_denied` → show toast: "Google sign-in was cancelled."  
If URL has `?error=google_failed` → show toast: "Google sign-in failed. Please try again."

**New Google env vars to add to Render:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = `https://your-backend.onrender.com/api/auth/google/callback`

**New migration to run in Supabase:**  
Run `002_google_auth.sql` — adds `google_id`, `avatar_url`, `auth_provider` columns to users table and makes `password_hash` nullable.

---

## DASHBOARD LAYOUT (applies to ALL dashboard pages)

The dashboard has a fixed sidebar on the left and a scrollable main content area on the right.

### Sidebar (fixed, full height)

**Top section:**  
The text "DailyNotion" in bold — this is the logo. Clicking it goes to /dashboard.  
Below the logo: the user's avatar (circle, initials if no avatar, Google profile photo if they signed in with Google), their full name in medium weight, their email in small gray text.

**Navigation links (vertical list, with icons):**  
- "Dashboard" — house icon — goes to /dashboard — active state: left border highlight
- "History" — clock icon — goes to /dashboard/history
- "Templates" — document stack icon — goes to /dashboard/templates
- "Settings" — gear icon — goes to /dashboard/settings
- "Billing" — credit card icon — goes to /dashboard/billing

**Bottom of sidebar:**  
"Log out" button — ghost/text style — calls POST /api/auth/logout, clears tokens, navigates to /login

**On mobile:** Sidebar collapses into a hamburger menu at the top.

---

## DASHBOARD HOME ( /dashboard )

Call these 3 endpoints when page loads:
- `GET /api/auth/me` → user info, subscription, onboarding
- `GET /api/journal/runs/latest` → most recent run
- `GET /api/journal/stats` → totalRuns, successRate, currentStreak

---

### Header
"Good morning, [first name]." — changes based on time of day:
- 5am–11:59am → "Good morning"
- 12pm–4:59pm → "Good afternoon"
- 5pm–8:59pm → "Good evening"
- 9pm–4:59am → "Good night"

Below the greeting: today's date in full, e.g. "Wednesday, May 28, 2025"

---

### Today's Journal Card (large, top of page, most prominent element)

**Title:** "Today's Journal"

This card has three possible states:

**State 1 — Already generated today (status = success):**  
Show a large green checkmark icon.  
Text: "Generated today at [time, e.g. 8:02 AM]"  
Subtext: "[tasksCount] tasks · [notesCount] notes pulled"  
Button: "Open in Notion" — opens `notion_page_url` in a new tab  
Small secondary button below: "Regenerate" — same as Generate Now but shows a confirmation dialog first: "This will create a second journal page for today. Are you sure?" with "Yes, regenerate" and "Cancel" buttons.

**State 2 — Not yet generated, schedule is set (Pro/Team):**  
Show a clock icon.  
Text: "Scheduled for [generate_time] [timezone abbreviation]"  
Subtext: "Your journal will be automatically created at this time."  
Button: "Generate Now" — calls POST /api/journal/generate  
While generating: button shows spinner + text "Generating..."  
On success: card switches to State 1, show toast "Journal generated! ✓"  
On error: show inline error message in red below the button

**State 3 — No schedule set (Free plan or schedule paused):**  
Show a pencil/journal icon.  
Text: "No journal yet today."  
Subtext (Free): "You're on the Free plan. Generate your journal manually whenever you're ready."  
Subtext (schedule paused): "Your schedule is paused. Resume it in Settings or generate manually."  
Button: "Generate Now" — same behavior as State 2  
Small link below (Free plan only): "Upgrade to Pro for automatic daily generation →" — goes to /dashboard/billing

---

### Stats Row (3 cards, side by side, below Today's Journal card)

These use data from `GET /api/journal/stats`.

**Card 1 — Total Journals**  
Large number: `totalRuns`  
Label below: "Journals generated"  
Icon: document with checkmark

**Card 2 — Success Rate**  
Large number: `successRate`%  
Label below: "Success rate"  
Icon: target/bullseye  
If successRate is 100%: number shows in green  
If successRate is below 80%: number shows in orange

**Card 3 — Current Streak**  
Large number: `currentStreak`  
Label below: "Day streak 🔥"  
Icon: flame  
If streak is 0: show "–" instead of 0 and label "No active streak"

---

### Your Setup Card (right column or below stats)

Title: "Your Notion Setup"

Call `GET /api/notion/config` to populate.

Shows:
- Row 1: Workspace icon (if available) + "Connected to [workspace_name]" + green dot
- Row 2: "Journal database:" + journal_db_name
- Row 3: "Tasks database:" + tasks_db_name
- Row 4 (if set): "Notes database:" + notes_db_name
- Row 4/5 (if set): "Habits database:" + habits_db_name

Below the rows:  
Small link: "Change databases →" — navigates to /onboarding/select-databases

If Notion is NOT connected (config is null):  
Show yellow warning card: "Notion is not connected. Journal generation is paused."  
Button: "Connect Notion" → /onboarding/connect-notion

---

### Schedule Card

Title: "Your Schedule"

Call `GET /api/schedule` to populate.

**If schedule exists and is_active = true:**  
Text: "Generating daily at [generate_time] [timezone]"  
Green dot + "Active"  
Toggle switch labeled "Pause schedule" — calls PATCH /api/schedule/toggle on change

**If schedule exists and is_active = false:**  
Text: "Paused — was set for [generate_time] [timezone]"  
Orange dot + "Paused"  
Toggle switch labeled "Resume schedule" — calls PATCH /api/schedule/toggle on change

**If no schedule (Free plan):**  
Text: "No schedule set."  
Subtext: "Upgrade to Pro to enable automatic daily generation."  
Button: "Upgrade to Pro" → /dashboard/billing

---

### Recent Runs Table (bottom of page)

Title: "Recent Journal Runs"  
Call `GET /api/journal/runs?limit=5`

Table columns:
- **Date** — e.g. "Wed, May 28" — formatted from run_at
- **Time** — e.g. "8:02 AM"
- **Trigger** — "Scheduled" or "Manual" — as a small badge
- **Status** — green "Success" badge or red "Failed" badge
- **Tasks** — number, e.g. "4 tasks"
- **Notes** — number, e.g. "2 notes"
- **Open** — "Open ↗" link that opens notion_page_url in a new tab (only shown if status = success)

**If status is "Failed":** hovering the red Failed badge shows a tooltip with the error_message text.

**Empty state** (no runs yet):  
Centered text: "No journals generated yet."  
Subtext: "Click 'Generate Now' above to create your first journal."

**Below table:**  
Link: "View full history →" — goes to /dashboard/history

---

## HISTORY PAGE ( /dashboard/history )

Call `GET /api/journal/runs?page=1&limit=20` on load. Re-fetch when pagination changes.

**Page title:** "Journal History"  
**Subtitle:** "A complete log of every journal DailyNotion has created for you."

**Filter bar (above table):**  
- Dropdown: "All statuses" / "Success only" / "Failed only"
- Dropdown: "All triggers" / "Scheduled only" / "Manual only"
- These are frontend-only filters on the current page of results (no backend filtering needed)

**Table — same columns as dashboard but full width:**
- Date & Time (combined, e.g. "Wed May 28, 2025 at 8:02 AM")
- Trigger badge ("Scheduled" in blue, "Manual" in purple)
- Status badge (green "Success", red "Failed")
- Tasks pulled (number)
- Notes pulled (number)
- Open in Notion (link, only if success)
- Error (only visible on failed rows — show the error_message in small red text below the row, or in an expandable row)

**Empty state:**  
Centered illustration area.  
Text: "No journal history yet."  
Subtext: "Once you generate your first journal, it will appear here."  
Button: "Generate Now" → triggers POST /api/journal/generate, same as dashboard

**Pagination controls (below table):**  
"← Previous" button — disabled on page 1  
"Page [current] of [totalPages]"  
"Next →" button — disabled on last page  
Small text: "Showing [offset+1]–[offset+count] of [total] runs"

---

## TEMPLATES PAGE ( /dashboard/templates )

Call `GET /api/templates` on load — returns `templates` (user's saved) and `defaultTemplates` (the 3 built-in ones).

**Page title:** "Templates"  
**Subtitle:** "Design how your daily journal looks. Use placeholders and we fill them with your real data."

---

### Free Plan State

Show a full-width banner at the top of the page:  
Background: soft yellow/amber  
Icon: lock  
Text: "Custom templates are a Pro feature."  
Subtext: "You're currently using the Simple Daily template. Upgrade to Pro to build your own templates, save up to 10 layouts, and fully customize your journal."  
Button: "Upgrade to Pro" → /dashboard/billing

Below the banner, show the 3 default templates as read-only preview cards (grayed out, no edit buttons). A lock icon overlays each card.

---

### Pro / Team Plan State

**"New template" button** — top right corner — opens the Template Editor (see below)

**Placeholder Reference Box** (always visible, collapsible):  
Title: "Available placeholders"  
Shows a small reference table:

| Placeholder | What it inserts |
|---|---|
| `{{date}}` | Today's full date, e.g. "Wednesday, May 28, 2025" |
| `{{tasks_today}}` | All tasks due today from your Tasks database, as a checklist |
| `{{notes_last_24h}}` | Notes created in the last 24 hours from your Notes database |
| `{{meetings_today}}` | Today's meetings — coming in a future update |
| `{{habit_tracker}}` | Habit tracker — coming in a future update |

**Your saved templates** (list):

Each template row shows:
- Template name (bold)
- "Default" green badge if is_default = true
- Preview of the first 3 lines of the body (truncated, monospace font)
- "Edit" button → opens Template Editor pre-filled with this template
- "Set as default" button (only shown if is_default = false) → calls PUT /api/templates/:id with `{ is_default: true }`
- "Delete" button (red, only shown if is_default = false) → shows confirmation dialog: "Delete [template name]? This cannot be undone." with "Delete" and "Cancel" buttons → calls DELETE /api/templates/:id

**If no saved templates yet:**  
Text: "You haven't created any templates yet."  
Subtext: "Start from one of the default templates below or create your own."  
Button: "Create your first template" → opens Template Editor

**Default templates section** (below saved templates):  
Title: "Start from a default"  
Shows the 3 default template cards. Each has a "Use this template" button → calls POST /api/templates/onboarding-select with `{ use_default: true, default_template_name }` then refreshes the list.

---

### Template Editor (modal that opens over the page)

**Modal title:** "New template" (or "Edit template" if editing)

Field 1: Template name  
Label: "Template name"  
Input: text field, placeholder: "e.g. My Daily Review"

Field 2: Template body  
Label: "Template body"  
Large textarea, monospace font, at least 20 rows tall  
Placeholder text inside textarea:  
```
# Journal — {{date}}

## ✅ Today's Tasks
{{tasks_today}}

## 📝 Recent Notes
{{notes_last_24h}}
```

Below textarea: small gray text: "Use placeholders like {{tasks_today}} — see the reference above."

Checkbox: "Set as my default template" — checked by default for new templates

**Buttons at bottom of modal:**  
"Save template" (primary) → calls POST /api/templates (new) or PUT /api/templates/:id (edit)  
"Cancel" (ghost) → closes modal, no changes saved

**On save success:** close modal, refresh template list, show toast: "Template saved ✓"  
**On error (hit 10 template limit):** show inline message in red: "You've reached the 10 template limit on Pro. Delete a template to add a new one."

---

## SETTINGS PAGE ( /dashboard/settings )

Call `GET /api/auth/me` and `GET /api/notion/config` and `GET /api/schedule` on load.

**Page title:** "Settings"

---

### Section 1: Account

**Subsection title:** "Account"

Row 1: Full name  
Label: "Full name"  
Editable text field pre-filled with current name  
Button: "Save" — calls PUT /api/auth/me (add this endpoint — body: `{ full_name }`)  
On success: show inline green text "Saved ✓"

Row 2: Email  
Label: "Email address"  
Display only (not editable) — shows current email  
Small gray note: "Email cannot be changed."

Row 3 (only shown if auth_provider is 'email' or 'both'): Password  
Label: "Change password"  
Two fields: "Current password" and "New password (min 8 characters)"  
Button: "Update password" — calls POST /api/auth/change-password (body: `{ currentPassword, newPassword }`)

Row 4: Google connection  
Label: "Google account"  
If auth_provider is 'google' or 'both': show "Connected — [google email]" + green checkmark. Button: "Disconnect Google" (only available if auth_provider is 'both', otherwise disabled with tooltip "You must have at least one login method")  
If auth_provider is 'email' only: show "Not connected" + Button "Connect Google account" → calls GET /api/notion/auth-url (wait — actually for Google, redirect to GET /api/auth/google)

Row 5: Avatar  
Label: "Profile photo"  
If Google user: shows their Google profile photo as a circle  
If email user: shows initials in a circle  
Note: "Profile photos are pulled from Google. Connect your Google account to add a photo."

---

### Section 2: Notion Connection

**Subsection title:** "Notion"

Row 1: Connection status  
If connected: green dot + "Connected to [workspace_name]"  
If not connected: red dot + "Not connected — journal generation is disabled"

Row 2 (if connected): Workspace  
Label: "Workspace"  
Value: workspace_name + workspace_icon

Row 3 (if connected): Reconnect  
Button: "Reconnect Notion" (outline button) — re-runs the OAuth flow (goes to GET /api/notion/auth-url and redirects)  
Subtext: "Use this if your journal generation stops working."

Row 4 (if connected): Disconnect  
Button: "Disconnect Notion" — red/danger style  
Clicking shows a confirmation dialog:  
Title: "Disconnect Notion?"  
Body: "This will disconnect your Notion workspace and pause all journal generation. Your templates and schedule will be saved. You can reconnect at any time."  
Buttons: "Yes, disconnect" (red) and "Cancel"  
On confirm: calls DELETE /api/notion/disconnect  
On success: navigate to /onboarding/connect-notion with toast: "Notion disconnected."

---

### Section 3: Databases

**Subsection title:** "Databases"

Shows four rows (Journal, Tasks, Notes, Habits):  
Label: "Journal database" | Value: journal_db_name (or "Not set" in gray)  
Label: "Tasks database" | Value: tasks_db_name  
Label: "Notes database" | Value: notes_db_name or "Not connected (optional)"  
Label: "Habits database" | Value: habits_db_name or "Not connected (optional)"

Button at bottom: "Change database selections" → navigates to /onboarding/select-databases

---

### Section 4: Schedule

**Subsection title:** "Journal Schedule"

If Free plan: show banner "Scheduled generation is a Pro feature. Upgrade to unlock automatic daily journals." + "Upgrade to Pro" button → /dashboard/billing

If Pro/Team plan:

Row 1: Current schedule  
If schedule exists and active: "Generating daily at [generate_time] [timezone]" + green "Active" badge  
If schedule paused: "[generate_time] [timezone]" + orange "Paused" badge

Row 2: Edit schedule  
Two fields inline:  
- Time: time picker labeled "Generate at" — pre-filled with current generate_time  
- Timezone: searchable timezone dropdown — pre-filled with current timezone  
Button: "Save schedule" → calls POST /api/schedule

Row 3: Toggle  
Toggle switch — label changes based on state:  
If active: "Pause automatic generation" → PATCH /api/schedule/toggle  
If paused: "Resume automatic generation" → PATCH /api/schedule/toggle  
On toggle: show toast "Schedule paused." or "Schedule resumed."

---

### Section 5: Danger Zone

**Subsection title:** "Danger Zone"  
This section has a red border/outline around it.

Row: Delete account  
Text: "Permanently delete your DailyNotion account and all your data. This cannot be undone."  
Button: "Delete my account" — red, outline style  
Clicking shows a confirmation dialog:  
Title: "Delete your account?"  
Body: "This will permanently delete your account, all your templates, your schedule, and your journal history. Your Notion data will NOT be deleted — we only remove what's on our servers. This cannot be undone."  
Input field: "Type DELETE to confirm" — the "Confirm deletion" button stays disabled until they type exactly "DELETE"  
Buttons: "Confirm deletion" (red, disabled until input matches) and "Cancel"  
On confirm: calls DELETE /api/auth/account → clears tokens → navigates to / (landing page) → shows toast "Your account has been deleted."

Add this endpoint to the backend: `DELETE /api/auth/account` — deletes the user row (cascades to all related tables due to ON DELETE CASCADE).

---

## BILLING PAGE ( /dashboard/billing )

Call `GET /api/billing/subscription` and `GET /api/plans` on load.

**Page title:** "Billing & Plan"

---

### Current Plan Card (top, full width)

**If Free plan:**  
Title: "You're on the Free plan"  
Shows the Free plan features list (same as landing page)  
Big button: "Upgrade to Pro — $10/month" → calls POST /api/billing/checkout with `{ plan: 'pro', interval: 'monthly' }`  
Secondary button: "See all plans ↓" — smooth scrolls to the plan comparison below

**If Pro plan (active):**  
Title: "Pro Plan"  
Shows: "Active" green badge  
Shows: "Billed [monthly/yearly]"  
Shows: "Next renewal: [current_period_end formatted as Month Day, Year]"  
Shows: "Started: [created_at formatted]"  
Button: "Manage billing" — calls POST /api/billing/portal → redirects to Stripe portal URL  
Small text below button: "You can cancel, change plans, or update your card in the Stripe billing portal."

**If Pro plan (past_due):**  
Show orange banner at top of card: "⚠️ Your last payment failed. Please update your payment method to keep your journal running."  
Button: "Fix payment method" → POST /api/billing/portal → Stripe portal

**If Team plan:**  
Title: "Team Plan"  
Shows: "Active" green badge + number of seats  
Shows billing and renewal same as Pro  
Shows: "[seats] seats included"  
Button: "Manage billing" → Stripe portal  
Button: "Add seats" → Stripe portal (they can add seats there)

---

### Plan Comparison (below current plan card)

Title: "Compare plans"

Same 3-column plan table as landing page. On the current plan's column, show "Your current plan" badge instead of the CTA button.  
On other plans' columns, show "Switch to [plan]" button.

Switching plans:  
- Downgrade to Free: show confirmation dialog "Downgrade to Free? You'll lose scheduled generation and custom templates at the end of your billing period." → if confirmed, redirect to Stripe portal
- Upgrade: → POST /api/billing/checkout with new plan details

---

### Billing History

Title: "Billing history"  
Subtext: "View your invoices in the Stripe billing portal."  
Button: "Open billing portal" → POST /api/billing/portal → redirect

---

## ADDITIONAL BACKEND ENDPOINTS NEEDED

These two endpoints are referenced in the dashboard spec but weren't in the original backend. Add them:

### PUT /api/auth/me
Updates the user's profile.  
Auth: required  
Body: `{ full_name }`  
Response: `{ user }`

```
router.put('/me', requireAuth, async (req, res) => {
  const { full_name } = req.body;
  if (!full_name?.trim()) return res.status(400).json({ error: 'Full name required' });
  const { data: user, error } = await supabase
    .from('users')
    .update({ full_name: full_name.trim() })
    .eq('id', req.user.id)
    .select('id, email, full_name, status, avatar_url, auth_provider')
    .single();
  if (error) return res.status(500).json({ error: 'Failed to update profile' });
  return res.json({ user });
});
```

### POST /api/auth/change-password
Changes password for email/both users.  
Auth: required  
Body: `{ currentPassword, newPassword }`  
Response: `{ message }`

```
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const { data: user } = await supabase
    .from('users')
    .select('password_hash, auth_provider')
    .eq('id', req.user.id)
    .single();
  if (user.auth_provider === 'google')
    return res.status(400).json({ error: 'Google accounts cannot set a password' });
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = await bcrypt.hash(newPassword, 12);
  await supabase.from('users').update({ password_hash: newHash }).eq('id', req.user.id);
  return res.json({ message: 'Password updated successfully' });
});
```

### DELETE /api/auth/account
Permanently deletes the account.  
Auth: required  
Body: `{ confirmation: "DELETE" }`  
Response: `{ message }`

```
router.delete('/account', requireAuth, async (req, res) => {
  const { confirmation } = req.body;
  if (confirmation !== 'DELETE')
    return res.status(400).json({ error: 'Type DELETE to confirm account deletion' });
  // Cancel Stripe subscription first if exists
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', req.user.id)
    .single();
  if (sub?.stripe_subscription_id) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (e) { /* log but don't block deletion */ }
  }
  // Delete user — all related rows cascade
  await supabase.from('users').delete().eq('id', req.user.id);
  return res.json({ message: 'Account deleted successfully' });
});
```

---

## COMPLETE API REFERENCE (updated with new endpoints)

🔒 = requires Authorization: Bearer token header

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/signup | — | Create account with email+password |
| POST | /api/auth/login | — | Login with email+password |
| GET | /api/auth/google | — | Start Google OAuth flow |
| GET | /api/auth/google/callback | — | Google OAuth callback (backend handles) |
| POST | /api/auth/refresh | — | Refresh access token |
| POST | /api/auth/logout | — | Revoke refresh token |
| GET | /api/auth/me | 🔒 | Get current user + subscription + onboarding |
| PUT | /api/auth/me | 🔒 | Update full_name |
| POST | /api/auth/change-password | 🔒 | Change password (email users only) |
| DELETE | /api/auth/account | 🔒 | Delete account permanently |
| GET | /api/plans | — | Get all plan definitions |
| POST | /api/plans/select | 🔒 | Select a plan after signup |
| POST | /api/billing/checkout | 🔒 | Create Stripe checkout session |
| POST | /api/billing/webhook | — | Stripe webhook (do not call from frontend) |
| GET | /api/billing/subscription | 🔒 | Get current subscription |
| POST | /api/billing/portal | 🔒 | Open Stripe billing portal |
| GET | /api/notion/auth-url | 🔒 | Get Notion OAuth URL |
| GET | /api/notion/callback | — | Notion OAuth callback (backend handles) |
| GET | /api/notion/databases | 🔒 | List all accessible Notion databases |
| POST | /api/notion/databases/select | 🔒 | Save database selections |
| GET | /api/notion/config | 🔒 | Get current Notion config |
| DELETE | /api/notion/disconnect | 🔒 | Disconnect Notion |
| GET | /api/onboarding/status | 🔒 | Get onboarding steps + next step |
| POST | /api/onboarding/complete | 🔒 | Mark onboarding complete |
| GET | /api/templates | 🔒 | Get user templates + default templates |
| POST | /api/templates | 🔒 | Create new template (Pro/Team) |
| PUT | /api/templates/:id | 🔒 | Update template |
| DELETE | /api/templates/:id | 🔒 | Delete template |
| POST | /api/templates/onboarding-select | 🔒 | Select template during onboarding |
| GET | /api/schedule | 🔒 | Get current schedule |
| POST | /api/schedule | 🔒 | Create/update schedule (Pro/Team) |
| PATCH | /api/schedule/toggle | 🔒 | Pause or resume schedule |
| POST | /api/journal/generate | 🔒 | Manual journal generation |
| GET | /api/journal/runs | 🔒 | Get journal run history (paginated) |
| GET | /api/journal/runs/latest | 🔒 | Get most recent run |
| GET | /api/journal/stats | 🔒 | Get total runs, success rate, streak |
