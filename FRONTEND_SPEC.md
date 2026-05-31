# DailyNotion — Frontend Spec & API Reference
## For your AI coder to build the frontend

---

## TECH STACK RECOMMENDATION

- **Framework:** React (Vite)
- **Routing:** React Router v6
- **State:** Zustand or Context API
- **Data fetching:** React Query (TanStack Query)
- **Forms:** React Hook Form
- **HTTP client:** Axios with a base instance pointing to the backend URL
- **Hosting:** Render (static site)

---

## BASE URL

All API calls go to: `https://your-backend.onrender.com`  
Store in `.env` as `VITE_API_URL`

All protected routes need the header:
```
Authorization: Bearer <accessToken>
```

Store `accessToken` and `refreshToken` in memory (or localStorage).  
On 401 with `code: TOKEN_EXPIRED`, call `POST /api/auth/refresh` to get a new access token.

---

## USER FLOW — THE EXACT ROUTING LOGIC

When a user logs in, the backend returns a `redirectTo` field. ALWAYS send them there — do not assume where they go. Here are all possible values:

| redirectTo | Meaning |
|---|---|
| `/select-plan` | Needs to pick a plan |
| `/checkout` | Selected a paid plan, needs to pay |
| `/onboarding/connect-notion` | Needs to connect Notion |
| `/onboarding/select-databases` | Needs to pick databases |
| `/onboarding/choose-template` | Needs to pick a template |
| `/onboarding/set-schedule` | Needs to set schedule |
| `/dashboard` | Fully set up, go to dashboard |

If any protected route returns `403` with `code: INCOMPLETE_FLOW` or `code: INCOMPLETE_ONBOARDING`, redirect to the `redirectTo` in the error response.

---

## PAGES & ROUTES

```
/                          → Landing page
/signup                    → Sign up page
/login                     → Log in page
/select-plan               → Plan selector (post signup)
/checkout                  → Stripe checkout redirect page
/onboarding/connect-notion → Step 1 of onboarding
/onboarding/select-databases → Step 2
/onboarding/choose-template  → Step 3
/onboarding/set-schedule     → Step 4
/dashboard                   → Main dashboard
/dashboard/history           → Journal run history
/dashboard/templates         → Template manager
/dashboard/settings          → Account settings
/dashboard/billing           → Billing & plan
/privacy                     → Privacy policy
/terms                       → Terms of service
```

---

## PAGE 1: LANDING PAGE ( / )

### Navigation bar (top, full width)
Left side: Logo — the text "DailyNotion" in bold. No image needed.  
Right side (links): "Features", "Pricing", "Log in" (text link), "Get started free" (filled button)

### Hero section (first thing user sees)
**Headline:** "Your Notion journal, written for you — every morning."  
**Subheadline:** "DailyNotion automatically creates your daily journal page in Notion and fills it with today's tasks, meetings, and notes. Wake up. Open Notion. It's already done."  
**Two buttons:**
- "Get started free" → goes to /signup
- "See how it works" → smooth scrolls to the Features section

**Below buttons:** Small text: "No credit card required. Free plan available."

### Features section (id="features")
**Section title:** "Everything you need. Nothing you don't."

Three feature cards, side by side:

**Card 1:**  
Icon: calendar  
Title: "Auto-generated daily pages"  
Description: "Every morning at your chosen time, DailyNotion creates a fresh journal page in your Notion workspace — titled, dated, and ready to go."

**Card 2:**  
Icon: checklist  
Title: "Pulls your real data"  
Description: "Tasks due today, notes from the last 24 hours, and upcoming meetings are automatically pulled from your Notion databases and dropped into the page."

**Card 3:**  
Icon: template/puzzle  
Title: "Your template, your way"  
Description: "Design your own journal layout using simple placeholders like {{tasks_today}} and {{meetings_today}}. DailyNotion fills them in with your actual data."

### How it works section
**Section title:** "Set up in 3 minutes."

Four steps, displayed as a numbered vertical list:

**Step 1:** "Sign up and connect your Notion"  
"One click. We use Notion's official OAuth — we never store your data inside Notion."

**Step 2:** "Select your databases"  
"Tell us which Notion database has your tasks and where to create your journal pages."

**Step 3:** "Pick a template"  
"Choose from our pre-built templates or build your own with placeholders."

**Step 4:** "Set your schedule"  
"Choose a time. We'll generate your journal every morning at exactly that time in your timezone."

### Pricing section (id="pricing")
**Section title:** "Simple pricing. No surprises."  
**Subtitle:** "Start free. Upgrade when you're ready."

Three pricing cards:

**Free card:**  
Title: "Free"  
Price: "$0 / month"  
Subtext: "Forever free"  
Button: "Get started free" → /signup  
Features list:
- Manual generation only
- 1 pre-built template
- Pull from 1 database
- 30-day history

**Pro card (mark as "Most popular"):**  
Title: "Pro"  
Price: "$10 / month"  
Annual option: "$100 / year (save $20)"  
Toggle between monthly/yearly pricing  
Button: "Start Pro" → /signup  
Features list:
- Scheduled daily generation
- Pull from up to 3 databases
- Custom template builder
- Email notification when ready
- Save up to 10 templates
- Full journal history

**Team card:**  
Title: "Team"  
Price: "$29 / month for 5 seats"  
Annual: "$290 / year (save $58)"  
Extra seats: "$5/seat/month"  
Button: "Start Team" → /signup  
Features list:
- Everything in Pro for all members
- Shared team templates
- Admin dashboard
- Audit logs
- Priority support

### FAQ section
**Section title:** "Questions? We've got answers."

Q: "Does this work with any Notion workspace?"  
A: "Yes. As long as you have a Notion account with at least one database for tasks and one for journals, DailyNotion works with any setup."

Q: "Do I need to know how to use Notion's relations or APIs?"  
A: "Not at all. DailyNotion handles all the complexity. You just click 'Connect' and choose which databases to use."

Q: "What happens if I'm on the Free plan and want to upgrade?"  
A: "Go to your billing settings at any time and upgrade in one click. Your data and templates carry over."

Q: "Is my Notion data safe?"  
A: "We only read the databases you explicitly choose. We never store the content of your tasks or notes on our servers — only the metadata needed to run the scheduler."

Q: "Can I cancel anytime?"  
A: "Yes. Cancel from your billing settings. No fees, no questions."

### Footer
Left: "DailyNotion" logo text  
Center links: "Features", "Pricing", "Privacy Policy" → /privacy, "Terms of Service" → /terms  
Right: "© 2025 DailyNotion. All rights reserved."

---

## PAGE 2: SIGN UP ( /signup )

**Page title:** "Create your account"  
**Subtitle:** "Start automating your Notion journal today."

Form fields:
- Full name (text input, placeholder: "Your full name")
- Email address (email input, placeholder: "you@example.com")
- Password (password input, placeholder: "At least 8 characters")
- Button: "Create account" — calls POST /api/auth/signup

Below button: "Already have an account? Log in" → /login  
And: "By creating an account you agree to our Terms of Service and Privacy Policy."

**On success:** Store accessToken + refreshToken. Navigate to `nextStep` from the response (which will be `/select-plan`).

**Errors to show inline:**
- "Email already in use" → show under email field
- "Password must be at least 8 characters" → show under password field
- Generic: show banner at top "Something went wrong. Please try again."

---

## PAGE 3: LOG IN ( /login )

**Page title:** "Welcome back"  
**Subtitle:** "Log in to your DailyNotion account."

Form fields:
- Email address
- Password
- Button: "Log in" — calls POST /api/auth/login

Below button: "Don't have an account? Sign up" → /signup  
And: "Forgot your password?" (placeholder link — you can wire this up later)

**On success:** Navigate to `redirectTo` from the response. This is critical — always use the backend's redirectTo, never hardcode `/dashboard`.

---

## PAGE 4: SELECT PLAN ( /select-plan )

**Page title:** "Choose your plan"  
**Subtitle:** "You can always change this later."

Same three pricing cards as the landing page (call GET /api/plans to populate them).

Each card has a "Select" button:
- Clicking any plan calls POST /api/plans/select with `{ plan: "free" | "pro" | "team" }`
- Free: redirectTo will be `/onboarding/connect-notion`
- Pro/Team: redirectTo will be `/checkout`

**Note:** Show a toggle for Monthly / Yearly pricing on paid plans.

---

## PAGE 5: CHECKOUT ( /checkout )

**Page title:** "Complete your purchase"  
**Subtitle:** "You're one step away from automated journaling."

Show a summary card:
- Plan name
- Price (based on what they selected)
- "Billed monthly" or "Billed annually"

One button: "Proceed to secure checkout" — calls POST /api/billing/checkout with `{ plan, interval, seats }`.  
The response gives a `checkoutUrl` — immediately redirect the browser to that Stripe URL.

Small text below: "Powered by Stripe. We never see or store your card details."

**On return from Stripe (success):** The URL will have `?session_id=...`. At this point, the webhook has already activated the user's account. Just call GET /api/auth/me to confirm status, then navigate to `/onboarding/connect-notion`.

---

## PAGE 6: ONBOARDING — CONNECT NOTION ( /onboarding/connect-notion )

**Progress bar at top:** 4 steps. Step 1 is active.  
Steps: "Connect Notion" → "Select databases" → "Choose template" → "Set schedule"

**Page title:** "Connect your Notion workspace"  
**Subtitle:** "We need read and write access to create your journal pages."

Big centered card:
- Notion logo icon
- Text: "DailyNotion connects to Notion using their official OAuth integration. We'll only access the databases you choose."
- Button: "Connect Notion" — calls GET /api/notion/auth-url, then redirects browser to the returned `authUrl`

**On return** (URL has `?notion=connected`): Automatically move to `/onboarding/select-databases`  
**On error** (URL has `?error=...`): Show message "Connection failed. Please try again." with the Connect button again.

---

## PAGE 7: ONBOARDING — SELECT DATABASES ( /onboarding/select-databases )

**Progress bar:** Step 2 active.  
**Page title:** "Select your Notion databases"  
**Subtitle:** "Tell us which databases to pull from and where to create your journal."

Call GET /api/notion/databases to get the list.

Show two required dropdowns:
1. **"Journal database"** — "Where should we create your daily journal pages?"  
   Dropdown of all databases returned from the API
2. **"Tasks database"** — "Which database has your daily tasks?"  
   Dropdown of all databases

Show two optional dropdowns (labeled "Optional"):
3. **"Notes database"** — "Which database has your notes? (optional)"
4. **"Habits database"** — "Do you track habits in Notion? (optional)"

Button: "Save and continue" — calls POST /api/notion/databases/select  
On success: navigate to `/onboarding/choose-template`

---

## PAGE 8: ONBOARDING — CHOOSE TEMPLATE ( /onboarding/choose-template )

**Progress bar:** Step 3 active.  
**Page title:** "Choose your journal template"  
**Subtitle:** "This is what your daily journal will look like. You can edit it later."

Call GET /api/templates to get `defaultTemplates`.

Show 3 template cards side by side. Each card shows:
- Template name
- A preview of the template body (shown in a gray code-like box, monospace font)
- "Select" button

When a template is selected, highlight the card with a border.

Button at bottom: "Use selected template" — calls POST /api/templates/onboarding-select with `{ use_default: true, default_template_name: selectedTemplate.name }`  
On success: navigate to `/onboarding/set-schedule`

Small text below: "On Pro and Team plans you can build fully custom templates in your dashboard."

---

## PAGE 9: ONBOARDING — SET SCHEDULE ( /onboarding/set-schedule )

**Progress bar:** Step 4 active.  
**Page title:** "When should we generate your journal?"  
**Subtitle:** "We'll create your journal page at this time every day."

Form:
- **Time picker** — label "Generate daily at" — time input (or dropdowns for hour + minute)
- **Timezone selector** — label "My timezone" — searchable dropdown of all IANA timezones (e.g. "America/New_York", "Europe/London")

Button: "Save schedule and finish" — calls POST /api/schedule with `{ generate_time: "08:00", timezone: "America/New_York" }`

**Free plan users:** Show a message instead of the form: "Scheduled generation is a Pro feature. You can generate your journal manually from your dashboard. Upgrade anytime." Show button "Go to dashboard" that navigates to `/dashboard`.

On success: navigate to `/dashboard` with a welcome toast: "🎉 You're all set! Your first journal will be generated tomorrow morning."

---

## PAGE 10: DASHBOARD ( /dashboard )

**Layout:** Sidebar on the left, main content on the right.

### Sidebar
Top: "DailyNotion" logo  
User's name and email below logo  
Nav links (vertical list):
- "Dashboard" (home icon) → /dashboard
- "History" (clock icon) → /dashboard/history
- "Templates" (document icon) → /dashboard/templates
- "Settings" (gear icon) → /dashboard/settings
- "Billing" (credit card icon) → /dashboard/billing

Bottom of sidebar: "Log out" button

### Main content — Dashboard home

**Page title:** "Good morning, [first name]." (or Good afternoon / Good evening based on time of day)

**Today's journal card** (large, prominent):  
Title: "Today's Journal"  
If already generated today: Show green checkmark + "Generated at 8:02 AM" + button "Open in Notion" (links to `notion_page_url`)  
If not yet generated: Show clock icon + "Scheduled for 8:00 AM" (or "No schedule set" for free users)  
Below: Big button "Generate Now" — calls POST /api/journal/generate  
If `code: ALREADY_GENERATED_TODAY` error: Show "Already generated today" message with link to open it.

**Stats row** (3 small cards, call GET /api/journal/stats):
- Card 1: "Total journals" — shows `totalRuns` number
- Card 2: "Success rate" — shows `successRate`%
- Card 3: "Current streak" — shows `currentStreak` days 🔥

**Recent runs** (last 5, call GET /api/journal/runs?limit=5):  
Table with columns: Date | Status | Tasks pulled | Notes pulled | Trigger | Open  
Each row shows the date of run, a green "Success" or red "Failed" badge, numbers, whether it was "Scheduled" or "Manual", and an "Open" link if successful.  
Below table: "View all history →" link to /dashboard/history

**Your setup card** (right column or below):  
Title: "Your setup"  
Shows: Notion workspace name + icon, Journal database name, Tasks database name, Schedule time + timezone  
Button: "Edit settings" → /dashboard/settings

---

## PAGE 11: HISTORY ( /dashboard/history )

**Page title:** "Journal History"  
**Subtitle:** "Every time DailyNotion ran for you."

Full paginated table (call GET /api/journal/runs?page=1&limit=20):
Columns: Date & Time | Trigger | Status | Tasks | Notes | Actions

Status badge: green "Success" or red "Failed"  
Actions column: "Open in Notion" link (only if successful, opens notion_page_url in new tab)  
If failed: show error message on hover/tooltip

Pagination controls below table: "Previous" and "Next" buttons + "Page X of Y"

---

## PAGE 12: TEMPLATES ( /dashboard/templates )

**Page title:** "Your Templates"  
**Subtitle:** "Design the layout of your daily journal."

**Free plan users:** Show a banner: "Custom templates are available on the Pro plan. You're currently using the Simple Daily template." + "Upgrade to Pro" button → /dashboard/billing

**Pro/Team users:**

"New template" button (top right) → opens a modal or inline editor

List of saved templates. Each row:
- Template name
- "Default" badge if it's the default
- "Edit" button — opens editor
- "Set as default" button (if not already default)
- "Delete" button (with confirmation)

**Template editor (modal or full page):**  
Field: Template name (text input)  
Field: Template body (large textarea, monospace font)  
Below textarea, show a "Placeholder reference" section:
- `{{date}}` — Today's date
- `{{tasks_today}}` — Tasks due today as a checklist
- `{{notes_last_24h}}` — Notes created in last 24 hours
- `{{meetings_today}}` — Today's meetings (Pro feature, coming soon)
- `{{habit_tracker}}` — Habit tracker (coming soon)

Buttons: "Save template" and "Cancel"

---

## PAGE 13: SETTINGS ( /dashboard/settings )

**Page title:** "Settings"

**Section: Account**  
- Full name (editable text field) + "Save" button
- Email address (display only, not editable)
- "Change password" — shows current password + new password fields

**Section: Notion Connection**  
Shows: Connected workspace name + icon  
Button: "Reconnect Notion" — re-runs OAuth flow  
Button: "Disconnect Notion" (danger, red) — calls DELETE /api/notion/disconnect. Shows confirmation dialog: "This will disconnect your Notion and pause all journal generation. Are you sure?"

**Section: Databases**  
Shows current selections for Journal DB, Tasks DB, Notes DB  
Button: "Change databases" → goes back to /onboarding/select-databases

**Section: Schedule**  
Shows current time + timezone  
Inline form to update: time picker + timezone selector + "Save schedule" button — calls POST /api/schedule  
Toggle switch: "Pause schedule" — calls PATCH /api/schedule/toggle

---

## PAGE 14: BILLING ( /dashboard/billing )

**Page title:** "Billing & Plan"

**Current plan card:**  
Shows plan name (Free / Pro / Team), status (Active / Past due), billing interval, next renewal date  

If Free: "Upgrade to Pro" button → calls POST /api/billing/checkout  
If Pro/Team: "Manage billing" button → calls POST /api/billing/portal, redirects to Stripe portal URL

**Plan comparison** (same feature table as landing page, smaller)

**Danger zone:**  
"Cancel subscription" — clicking this opens Stripe portal (same as Manage billing)

---

## PAGE 15: PRIVACY POLICY ( /privacy )

**Page title:** "Privacy Policy"  
**Last updated:** January 1, 2025

---

**1. Who we are**  
DailyNotion ("we", "us", "our") is a web application that automates the creation of daily journal pages in Notion. We are operated as an independent SaaS product.

**2. What information we collect**  
We collect the following information when you use DailyNotion:

*Account information:* Your name, email address, and encrypted password when you sign up.

*Notion integration data:* Your Notion OAuth access token (encrypted at rest), your Notion workspace ID, and the IDs of the databases you select. We do not store the content of your tasks, notes, or journal pages on our servers — we only read them at the moment of journal generation and write the result directly to your Notion workspace.

*Usage data:* Logs of when your journal was generated, whether generation succeeded or failed, and the count of tasks/notes included. This is used to show you your history dashboard.

*Payment information:* We use Stripe to process payments. We never see or store your card number. Stripe may collect billing information directly.

**3. How we use your information**  
We use your information to:
- Create and manage your account
- Connect to your Notion workspace and generate your journal
- Run your schedule and trigger journal generation at your chosen time
- Send you email notifications (if enabled)
- Process your subscription payments through Stripe
- Provide you with your journal run history

We do not sell your data to third parties. We do not use your data for advertising.

**4. Data storage and security**  
Your data is stored in Supabase (PostgreSQL), hosted on secure servers. Your Notion access token is stored encrypted. Passwords are hashed using bcrypt and never stored in plain text. All data transmission uses HTTPS/TLS.

**5. Third-party services**  
DailyNotion uses the following third-party services:
- **Notion API** — to read your databases and create journal pages
- **Stripe** — for payment processing
- **Resend** — for transactional email (journal ready notifications)
- **Supabase** — for database hosting

Each of these services has their own privacy policy.

**6. Your rights**  
You may request deletion of your account and all associated data at any time by contacting us at privacy@dailynotion.app. Upon deletion, we remove your account information, Notion credentials, schedule, and all journal run history from our database within 30 days.

**7. Cookies**  
We use minimal cookies necessary for session management. We do not use tracking cookies or advertising cookies.

**8. Changes to this policy**  
We may update this policy from time to time. We will notify you by email if we make material changes.

**9. Contact**  
Questions? Email us at privacy@dailynotion.app

---

## PAGE 16: TERMS OF SERVICE ( /terms )

**Page title:** "Terms of Service"  
**Last updated:** January 1, 2025

---

**1. Acceptance**  
By creating an account and using DailyNotion, you agree to these Terms of Service. If you do not agree, do not use the service.

**2. Description of service**  
DailyNotion is a web application that connects to your Notion workspace via OAuth and automatically creates daily journal pages populated with data from your Notion databases. The service is provided "as is."

**3. Your account**  
You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating your account. You must be at least 13 years old to use DailyNotion.

**4. Acceptable use**  
You agree not to:
- Use DailyNotion to violate any laws or regulations
- Attempt to gain unauthorized access to our systems
- Use the service to harass, harm, or defraud others
- Resell or redistribute the service without our written permission

**5. Notion integration**  
When you connect your Notion workspace, you grant DailyNotion permission to read databases you select and create pages in your journal database. You can revoke this permission at any time through your Notion settings or through DailyNotion's settings page. We are not affiliated with or endorsed by Notion Labs, Inc.

**6. Subscription and payments**  
Paid subscriptions are billed monthly or annually as selected. Subscriptions renew automatically until cancelled. You may cancel at any time through the billing settings. No refunds are provided for partial billing periods. If payment fails, your account will be downgraded to the Free plan after a grace period.

**7. Service availability**  
We aim for high availability but do not guarantee uninterrupted service. Scheduled journal generation may occasionally be delayed or fail due to third-party API outages (e.g. Notion API downtime). We are not liable for missed journal generations.

**8. Limitation of liability**  
DailyNotion is not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability to you shall not exceed the amount you paid us in the 12 months prior to the claim.

**9. Termination**  
We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time from your settings page.

**10. Changes to terms**  
We may update these terms from time to time. Continued use of DailyNotion after changes constitutes acceptance of the new terms.

**11. Contact**  
Questions? Email us at hello@dailynotion.app

---

## FULL API REFERENCE

### AUTH

**POST /api/auth/signup**  
Body: `{ email, password, full_name }`  
Response: `{ user, accessToken, refreshToken, nextStep }`  
nextStep is always `/select-plan`

**POST /api/auth/login**  
Body: `{ email, password }`  
Response: `{ user, accessToken, refreshToken, redirectTo }`  
redirectTo tells you exactly where to send the user

**POST /api/auth/refresh**  
Body: `{ refreshToken }`  
Response: `{ accessToken, refreshToken }`

**POST /api/auth/logout**  
Body: `{ refreshToken }`  
Response: `{ message }`

**GET /api/auth/me** 🔒  
Response: `{ user, subscription, onboarding }`

---

### PLANS & BILLING

**GET /api/plans**  
Public. Response: `{ plans: [...] }`

**POST /api/plans/select** 🔒  
Body: `{ plan: "free" | "pro" | "team" }`  
Response: `{ message, redirectTo }`  
Free → redirectTo: `/onboarding/connect-notion`  
Paid → redirectTo: `/checkout`

**POST /api/billing/checkout** 🔒  
Body: `{ plan, interval: "monthly"|"yearly", seats }`  
Response: `{ checkoutUrl, sessionId }`  
Redirect browser to checkoutUrl immediately

**POST /api/billing/portal** 🔒  
Body: none  
Response: `{ portalUrl }`  
Redirect browser to portalUrl

**GET /api/billing/subscription** 🔒  
Response: `{ subscription }`

**POST /api/billing/webhook**  
Stripe webhook — do not call from frontend

---

### NOTION

**GET /api/notion/auth-url** 🔒  
Response: `{ authUrl }`  
Redirect browser to authUrl

**GET /api/notion/callback**  
Handled server-side. Redirects to frontend.

**GET /api/notion/databases** 🔒  
Response: `{ databases: [{ id, name, url, properties }] }`

**POST /api/notion/databases/select** 🔒  
Body: `{ journal_db_id, journal_db_name, tasks_db_id, tasks_db_name, notes_db_id?, notes_db_name?, habits_db_id?, habits_db_name? }`  
Response: `{ message, redirectTo }`

**GET /api/notion/config** 🔒  
Response: `{ config: { workspace_name, workspace_icon, journal_db_name, tasks_db_name, ... } }`

**DELETE /api/notion/disconnect** 🔒  
Response: `{ message }`

---

### ONBOARDING

**GET /api/onboarding/status** 🔒  
Response: `{ onboarding, steps, nextStep, isComplete }`

**POST /api/onboarding/complete** 🔒  
Response: `{ message, redirectTo }`

---

### TEMPLATES

**GET /api/templates** 🔒  
Response: `{ templates: [...], defaultTemplates: [...] }`

**POST /api/templates** 🔒 (Pro/Team only)  
Body: `{ name, body, is_default? }`  
Response: `{ template }`

**PUT /api/templates/:id** 🔒  
Body: `{ name?, body?, is_default? }`  
Response: `{ template }`

**DELETE /api/templates/:id** 🔒  
Response: `{ message }`

**POST /api/templates/onboarding-select** 🔒  
Body: `{ use_default: true, default_template_name }` OR `{ template_id }`  
Response: `{ message, redirectTo }`

---

### SCHEDULE

**GET /api/schedule** 🔒  
Response: `{ schedule }`

**POST /api/schedule** 🔒 (Pro/Team only)  
Body: `{ generate_time: "08:00", timezone: "America/New_York" }`  
Response: `{ schedule, message, redirectTo }`

**PATCH /api/schedule/toggle** 🔒  
Response: `{ schedule }` — is_active will be toggled

---

### JOURNAL

**POST /api/journal/generate** 🔒  
No body needed  
Response: `{ message, pageUrl, tasksCount, notesCount }`  
Error 409: `{ error, existingPageUrl, code: "ALREADY_GENERATED_TODAY" }`

**GET /api/journal/runs** 🔒  
Query: `?page=1&limit=20`  
Response: `{ runs: [...], pagination: { page, limit, total, totalPages } }`

**GET /api/journal/runs/latest** 🔒  
Response: `{ run }`

**GET /api/journal/stats** 🔒  
Response: `{ totalRuns, successRate, currentStreak }`

---

## ERROR HANDLING

All errors return:
```json
{ "error": "Human readable message", "code": "MACHINE_READABLE_CODE" }
```

Key codes to handle in the frontend:

| Code | What to do |
|---|---|
| `TOKEN_EXPIRED` | Call /api/auth/refresh then retry |
| `INCOMPLETE_FLOW` | Redirect to `redirectTo` in response |
| `INCOMPLETE_ONBOARDING` | Redirect to `redirectTo` in response |
| `ACCOUNT_SUSPENDED` | Redirect to /dashboard/billing |
| `PLAN_REQUIRED` | Show upgrade modal |
| `ALREADY_GENERATED_TODAY` | Show "Already done" message with link |

---

## TOAST NOTIFICATIONS

Show these success toasts at key moments:
- After signup: "Account created! Let's pick your plan."
- After plan selected (free): "Free plan activated. Let's connect Notion!"
- After Notion connected: "Notion connected successfully!"
- After databases selected: "Databases saved!"
- After template chosen: "Template saved!"
- After schedule saved: "Schedule set! Your first journal generates tomorrow morning."
- After manual generate: "Journal generated! Opening in Notion..."
- After disconnecting Notion: "Notion disconnected."
- After logging out: "Logged out successfully."
