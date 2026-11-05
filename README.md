# Reach Studio

Interactive content builder for **ReachLMS (Canvas)**, integrated with **LTI 1.3 / LTI Advantage**.

Teachers click the **Reach Studio** button in the ReachLMS Rich Content Editor (RCE). A pop-up opens where they:

1. **Create an account** the first time. The account is linked to their ReachLMS login, so after that the studio opens straight away.
2. **Build new interactive content** with a visual builder and a live preview.
3. **Store and organise** what they've made: folders, search, filter by type, duplicate, move and delete.
4. **Insert** any item into the page, quiz, assignment or discussion they're editing.

Students see the content embedded inline. Scored content can also be added as a **graded assignment**, and scores go to the ReachLMS gradebook automatically.

> **Quickest test, nothing to install:** [open it in GitHub Codespaces](https://codespaces.new/KyleRoets/H5P.LTI?ref=reach-studio-lti-tool). It starts in demo mode with a pretend ReachLMS course in a new tab.
>
> **New here?** Follow the step-by-step [setup and testing guide](docs/SETUP-GUIDE.md): try it locally, host it on Render, install it into ReachLMS, then test it in a course.

## Content types

These are 10 of the most-used interactive types in H5P/Lumi-style tools, written as original code with no H5P dependency.

| Type | What learners do | Graded |
|---|---|---|
| Presentation | Slides (5 layouts, colours, images) with built-in questions; full-screen and keyboard navigation | ✓ |
| Image Hotspots | Click numbered markers on an image to reveal text and pictures | – |
| Interactive Video | YouTube or uploaded MP4/WebM pauses at set times for questions or info | ✓ |
| Quiz (Question Set) | Multiple choice, multi-select and true/false; feedback, pass mark, shuffling | ✓ |
| Drag and Drop | Drag labels onto zones on an image or board, with distractors | ✓ |
| Fill in the Blanks | Type missing words; alternative answers (`*colour/color*`) | ✓ |
| Drag the Words | Drag words into gaps; optional extra wrong words | ✓ |
| Flashcards | Flip cards with optional images | – |
| Accordion | Expandable sections (FAQs, glossaries) | – |
| Mark the Words | Click the words that match a rule | ✓ |

Every player works with mouse, touch and keyboard. Drag interactions also support "click to pick, click to place".

## How the LTI integration works

| Placement (registered automatically) | Message type | What it does in ReachLMS |
|---|---|---|
| `editor_button` | Deep Linking | Reach Studio button in the RCE. Inserts an `ltiResourceLink` with an `iframe` size, so content shows inline in pages, assignments, quizzes and discussions |
| `assignment_selection` | Deep Linking | *Assignment → Submission type → External Tool*. Scored content includes a `lineItem`, so ReachLMS creates a graded assignment |
| `link_selection` | Deep Linking | *Modules → Add item → External Tool* |
| `course_navigation` | Resource Link | Optional "Reach Studio" course menu link for teachers. **Disabled by default**; teachers enable it in *Settings → Navigation* |

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
1. Click **Install Reach Studio**.
2. Use the RCE's **Reach Studio** button to create an account, build something and **Save & insert**.
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
public/js/studio.js        Studio app: account, library, type gallery, builder, insert
public/js/player-page.js   Player shown to learners inside ReachLMS
public/js/types/*.js       The 10 content types (editor + player each)
test/mock-canvas.js        Mock ReachLMS/Canvas platform
test/e2e-lti.test.js       End-to-end test
```

## Operations and security notes

- **Back up `DATA_DIR`.** It holds `studio.db` (accounts and content), `tool-keys.json` (the tool's private signing key, file mode 600) and `media/` (uploads). Losing the key means ReachLMS must re-register the tool.
- **Passwords** are hashed with bcrypt, and sign-in has basic brute-force throttling.
- **Uploads:** only PNG, JPG, GIF, WebP, MP4, WebM and MP3 are accepted. They are stored under unguessable random names and served with `nosniff`. Anyone with a media link can view it, which is needed so embedded content loads for students.
- **Author text** is escaped and only a small formatting syntax is allowed (`**bold**`, `_italic_`, `[link](https://…)`), so content can't inject scripts into ReachLMS pages.
- **Grading model:** scores are calculated in the learner's browser and capped at the activity's maximum on the server. That's fine for formative activities. For high-stakes assessment, use ReachLMS's native quizzes, or add server-side answer checking.
- **What is graded where:** content inserted with the RCE button is display-only (Canvas doesn't link RCE embeds to the gradebook). Use *Assignment → External Tool → Reach Studio* for graded activities.
- **Quizzes:** the RCE button works where ReachLMS's editor shows LTI editor tools (pages, assignments, discussions, Classic Quiz questions). Support inside New Quizzes depends on your ReachLMS version, so check there first.
- **Interactive Video:** YouTube videos need the learner's browser to be able to reach youtube.com.
- **Editing after embedding:** embeds reference content by ID, so editing an item updates it everywhere it is embedded. When the owner views an embed in ReachLMS, they see an **✎ Edit in Reach Studio** button.
- **Scaling:** for multiple server instances, move SQLite and `media/` to shared storage (e.g. Postgres and S3). The in-memory sign-in throttle and token cache are per instance.
