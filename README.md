# ReachStudio by YouMultiply

Interactive content builder for **ReachLMS (Canvas)**, integrated with **LTI 1.3 / LTI Advantage**.

Teachers click the **ReachStudio** button in the ReachLMS Rich Content Editor (RCE). A pop-up opens where they:

1. **Create an account** the first time. The account is linked to their ReachLMS login, so after that the studio opens straight away.
2. **Build new interactive content** with a visual builder and a live preview.
3. **Store and organise** what they've made: folders, search, filter by type, duplicate, move and delete.
4. **Insert** any item into the page, quiz, assignment or discussion they're editing.

Students see the content embedded inline. Scored content can also be added as a **graded assignment**, and scores go to the ReachLMS gradebook automatically.

> **Quickest test, nothing to install:** [open it in GitHub Codespaces](https://codespaces.new/KyleRoets/H5P.LTI?ref=reach-studio-lti-tool). It starts in demo mode with a pretend ReachLMS course in a new tab.
>
> **New here?** Follow the step-by-step [setup and testing guide](docs/SETUP-GUIDE.md): try it locally, host it on Render, install it into ReachLMS, then test it in a course.

## Content types

29 interactive types covering what H5P and Lumi offer, written as original code with no H5P dependency. The "Create new" gallery groups them into four categories and has a search box. "Graded" types send a score to the ReachLMS gradebook when added as an assignment.

**Questions & quizzes**

| Type | What learners do | Graded |
|---|---|---|
| Quiz | Multiple choice, multi-select and true/false; feedback, pass mark, shuffling | ✓ |
| Fill in the Blanks | Type missing words; alternative answers (`colour/color`) | ✓ |
| Drag and Drop | Drag labels onto zones on an image or board, with distractors | ✓ |
| Drag the Words | Drag words into gaps; optional extra wrong words | ✓ |
| Mark the Words | Click the words that match a rule | ✓ |
| Find the Hotspot | Click the right area(s) of an image | ✓ |
| Put in Order | Put items (text or images) in the right order | ✓ |
| Matching Pairs | Match each item on the left with one on the right | ✓ |
| Summary | Pick the correct statement from each set to build a summary | ✓ |
| Essay | Write an answer; scored on keywords, with a model answer shown | ✓ |
| Dictation | Listen (audio or text-to-speech) and type what you hear | ✓ |
| Arithmetic Quiz | Timed sums: +, −, ×, ÷ or mixed | ✓ |

**Lessons & stories**

| Type | What learners do | Graded |
|---|---|---|
| Presentation | Slides (5 layouts, colours, images) with built-in questions; full-screen and keyboard navigation | ✓ |
| Interactive Book | Chapters of text, images and any other activity, with progress and a total score | ✓ |
| Branching Scenario | Choose a path through scenes to one of several endings, optionally scored | ✓ |
| Interactive Video | YouTube or uploaded MP4/WebM pauses at set times for questions or info | ✓ |
| Timeline | Scroll through dated events with images | – |
| Accordion | Expandable sections (FAQs, glossaries) | – |

**Images & media**

| Type | What learners do | Graded |
|---|---|---|
| Image Hotspots | Click markers on an image to reveal text and pictures (8 marker icons, sizes, shapes and colours) | – |
| Image Slider | Step through a captioned image carousel | – |
| Before and After | Drag a handle to compare two images | – |
| Collage | Several images in a chosen grid layout | – |
| Chart | Bar, horizontal bar, pie or doughnut chart | – |
| Guess the Answer | Look at an image, think, then reveal the answer | – |

**Games & practice**

| Type | What learners do | Graded |
|---|---|---|
| Memory Game | Flip cards to find matching pairs | – |
| Crossword | Solve a generated crossword from clues | ✓ |
| Word Search | Find hidden words in a letter grid | ✓ |
| Flashcards | Flip cards with optional images | – |
| Personality Quiz | Answers lead to one of several results | – |

Every type has a full description (what it is, what it's good for, what learners do, a tip) and a working example in the "Learn more" panel. New content starts empty; teachers can also start from the example.

**Editing:**
- **Rich text:** a toolbar with bold, italic, underline and strikethrough, text and highlight colours, lists, alignment and links. Answers for Fill in the Blanks, Drag the Words and Mark the Words are marked with a **Make answer** button.
- **Appearance tab:** accent, background and text colours, font, text size, corner style and embed width for every item, plus per-item colours (hotspot markers, drop zones, card faces, accordion headings, slide backgrounds).
- **Undo and redo:** buttons, or Ctrl/Cmd+Z.
- **Lists:** duplicate, reorder and collapse items.
- **Live preview:** renders at the real embed width, with tablet and phone sizes, so what you see is exactly what appears in ReachLMS.

**Roles:**
- **Teacher (default):** their own library and builder.
- **Admin:** an **Admin** tab with usage statistics, content by type and the connected ReachLMS sites, plus user management: view a user's content, suspend or reactivate, make admin, or delete the account and its content.
- **Passwords and recovery:**
  - The account menu (click your avatar) has **Change password**. When ReachLMS has just confirmed who you are, you don't need your current password; otherwise you do.
  - **Forgot your password?** If you've opened ReachStudio from ReachLMS before, opening it from ReachLMS again lets you choose a new password. This works because signing out keeps the ReachLMS link but stops automatic sign-in.
  - Otherwise, an admin uses the **key** button in the Admin tab to create a one-time reset link, valid for 1 hour, and sends it to the person.
  - Any password change or reset signs out the account's other sessions. Other ReachLMS logins then need to sign in once with the new password.
- **Becoming an admin:** list admin emails in `ADMIN_EMAILS`, or run `npm run make-admin -- someone@school.edu`. In demo mode the first account is an admin.

Every player works with mouse, touch and keyboard. Drag interactions also support "click to pick, click to place".

## How the LTI integration works

| Placement (registered automatically) | Message type | What it does in ReachLMS |
|---|---|---|
| `editor_button` | Deep Linking | ReachStudio button in the RCE. Inserts an `ltiResourceLink` with an `iframe` size, so content shows inline in pages, assignments, quizzes and discussions |
| `assignment_selection` | Deep Linking | *Assignment → Submission type → External Tool*. Scored content includes a `lineItem`, so ReachLMS creates a graded assignment |
| `link_selection` | Deep Linking | *Modules → Add item → External Tool* |
| `course_navigation` | Resource Link | Optional "ReachStudio" course menu link for teachers. **Disabled by default**; teachers enable it in *Settings → Navigation* |

Standards used:
- **Login and launch:** OIDC third-party login (`/lti/login`), then signed `id_token` validation (`/lti/launch`). The tool checks the signature against the platform's public keys, plus the issuer, audience, nonce (single use), version and deployment.
- **Deep Linking 2.0:** responses are signed with the tool's own RSA key, published at `/.well-known/jwks.json`.
- **Assignment and Grade Services (grades):** the tool gets an access token using its own signed key (`client_credentials` with `private_key_jwt`), then posts the score to `{lineitem}/scores`.
- **Dynamic Registration:** at `/lti/register`. Manual JSON configuration is also available at `/lti/canvas-config.json`.
- **Embed height:** embedded content tells ReachLMS its height (`lti.frameResize`), so iframes fit the content without scrollbars.
- **No third-party cookies:** each launch gets its own short-lived session token, so the tool works in Safari and other browsers that block cookies inside iframes.

## Install into ReachLMS

### 1. Deploy the tool on HTTPS

```bash
cp .env.example .env        # set PUBLIC_URL to your https address
```

```bash
npm ci
```

```bash
npm start
```

Or on **Render**: use *New → Blueprint* with this repository. `render.yaml` sets up the service and a persistent disk; see the [setup guide](docs/SETUP-GUIDE.md#part-2-put-it-on-the-internet-render). **Netlify and other static or serverless hosts can't run this app.**

Or with Docker (keep `/data` on a persistent volume; the image fixes the volume's ownership on start and then runs as the unprivileged `node` user):

```bash
docker build -t reach-studio .
```

```bash
docker run -d -p 3000:3000 -e PUBLIC_URL=https://studio.example.com -e TRUST_PROXY=true -v reach-studio-data:/data reach-studio
```

Put it behind a TLS reverse proxy (nginx, Caddy or a load balancer). Requirements:
- **Node 22.5+** (it uses the built-in SQLite).
- **Allow framing:** the tool must be framable by your ReachLMS domain. It deliberately sends no `X-Frame-Options` header, so make sure your proxy doesn't add one either.
- **Network access both ways:** ReachLMS must be able to reach the tool's `/.well-known/jwks.json`, and the tool must be able to reach ReachLMS's `/api/lti/security/jwks` and `/login/oauth2/token`.

### 2a. Dynamic Registration (recommended)

1. In ReachLMS go to **Admin → Developer Keys → + Developer Key → + LTI Registration** (newer versions: *Admin → Apps → Manage → + App → Dynamic Registration*).
2. Paste `https://<your-studio>/lti/register`. If you set `REGISTRATION_CODE`, enter it, then click **Install**.
3. Review the key in ReachLMS, make sure it is **ON**, then deploy it: *Admin → Settings → Apps → + App → By Client ID*.

Dynamic Registration reads ReachLMS's own issuer and endpoints, so it works whether ReachLMS is Instructure-hosted or self-hosted.

### 2b. Manual install (if Dynamic Registration isn't available)

1. In ReachLMS: **Developer Keys → + LTI Key → Method: Enter URL** → `https://<your-studio>/lti/canvas-config.json`. Set the redirect URI to `https://<your-studio>/lti/launch`. Save, turn it **ON**, and copy the Client ID.
2. Register ReachLMS in the tool:
   ```bash
   npm run add-platform -- --issuer <ReachLMS issuer> --client-id <client id> --base https://<your-reachlms-domain> --name "ReachLMS"
   ```
   - **Issuer:** on a self-hosted (open-source) Canvas, this is the `lti_iss` value in ReachLMS's `config/security.yml`. On Instructure-hosted Canvas it is `https://canvas.instructure.com`, and the endpoints live on `https://sso.canvaslms.com` (pass `--auth`, `--token` and `--jwks` explicitly).
3. Deploy the tool by Client ID, as in step 2a.

## Demo mode (no ReachLMS needed)

`npm run demo` (or `DEMO_MODE=true`) serves a pretend ReachLMS at `/demo` on the same address as the tool, so the whole flow can be tested from one URL. This works locally, in GitHub Codespaces (configured in `.devcontainer/`), or on a free Render service. The public address is detected automatically on Render and Codespaces. **Never use demo mode on the instance your real ReachLMS talks to.**

## Local demo with a separate mock (two processes)

`test/mock-canvas.js` is a small mock ReachLMS. It provides a course page with a Rich Content Editor button, Dynamic Registration, deep link return, a token endpoint and a gradebook.

```bash
npm install
```

```bash
PUBLIC_URL=http://localhost:3000 ALLOW_INSECURE_PLATFORMS=true npm start
```

In a second terminal:

```bash
npm run mock-canvas
```

Then open <http://localhost:4000>:
1. Click **Install ReachStudio**.
2. Use the RCE's **ReachStudio** button to create an account, build something and **Save & insert**.
3. Add a graded assignment, then switch to **Student** to complete it and watch the gradebook update.

## Tests

```bash
npm test
```

This is an end-to-end test against the mock platform, 16 steps in total. It covers:
- Dynamic Registration, and rejecting launches from unknown platforms.
- OIDC launches, account creation and identity linking.
- Folders and content operations, and uploads (SVG and other file types are rejected).
- Signed deep-linking responses for RCE embeds and graded assignments.
- Student launches and grade passback.
- Course navigation behaviour for teachers and students.
- Rejecting a tampered `id_token` and a replayed launch.
- Keeping each user's content private.

## Project layout

```
src/server.js      Express app
src/lti.js         LTI 1.3: login, launch, deep linking, AGS, dynamic registration, Canvas JSON config
src/api.js         Accounts, folders, content, uploads, embed, scores
src/sessions.js    Bearer-token sessions (no third-party cookies)
src/db.js          SQLite schema (node:sqlite)
src/keys.js        Tool RSA key pair (generated on first start into DATA_DIR)
src/types.js       Server-side scoring/embed sizes per content type
src/admin.js       Admin API (stats, users, suspend/reactivate/delete)
src/demo/          Pretend ReachLMS used by demo mode and tests
public/js/studio.js        Studio app: account, library, type gallery, builder, insert
public/js/player-page.js   Player shown to learners inside ReachLMS
public/js/types/*.js       The 29 content types (editor, player, description, example)
public/js/icons.js         Line icon set
public/js/covers.js        Cover illustrations for each type
public/js/brand.js         ReachStudio logo (vectorised ReachLMS hand)
test/mock-canvas.js        Mock ReachLMS/Canvas platform
test/e2e-lti.test.js       End-to-end test
```

## Operations and security notes

- **Back up `DATA_DIR`.** It holds `studio.db` (accounts and content), `tool-keys.json` (the tool's private signing key, file mode 600) and `media/` (uploads). Losing the key means ReachLMS must re-register the tool.
- **Passwords** are hashed with bcrypt, and sign-in has basic brute-force throttling.
- **Uploads:** only PNG, JPG, GIF, WebP, MP4, WebM and MP3 are accepted. They are stored under unguessable random names and served with `nosniff`. Anyone with a media link can view it, which is needed so embedded content loads for students.
- **Author text** is rich text passed through an allow-list sanitiser: only formatting tags, safe colours or alignment, and http(s) or mailto links are kept. Content can't inject scripts into ReachLMS pages.
- **Suspended accounts** are signed out immediately and can't sign in. Their embedded content keeps working for students. Deleting an account removes its content and uploaded files.
- **Grading model:** scores are calculated in the learner's browser and capped at the activity's maximum on the server. That's fine for formative activities. For high-stakes assessment, use ReachLMS's native quizzes, or add server-side answer checking.
- **What is graded where:** content inserted with the RCE button is display-only (Canvas doesn't link RCE embeds to the gradebook). Use *Assignment → External Tool → ReachStudio* for graded activities.
- **Quizzes:** the RCE button works where ReachLMS's editor shows LTI editor tools (pages, assignments, discussions, Classic Quiz questions). Support inside New Quizzes depends on your ReachLMS version, so check there first.
- **Interactive Video:** YouTube videos need the learner's browser to be able to reach youtube.com.
- **Editing after embedding:** embeds reference content by ID, so editing an item updates it everywhere it is embedded. When the owner views an embed in ReachLMS, they see an **✎ Edit in ReachStudio** button.
- **Scaling:** for multiple server instances, move SQLite and `media/` to shared storage (e.g. Postgres and S3). The in-memory sign-in throttle and token cache are per instance.
