# Reach Studio: setup and testing guide

This guide takes you from "the code is on GitHub" to "teachers are using it in ReachLMS". Work through the parts in order, and stop at a part if something doesn't match what's described.

| Part | What you do | Time | You need |
|---|---|---|---|
| 1 | Try it on your own computer with a pretend ReachLMS | 20 min | A computer you can install software on |
| 2 | Put it on the internet (Render) | 30 min | A Render account and a payment card (about $7–8/month) |
| 3 | Install it into ReachLMS | 15 min | A ReachLMS **admin** login |
| 4 | Test it in a real ReachLMS course | 20 min | A test or sandbox course |
| 5 | Roll it out to teachers | – | – |

Troubleshooting is at the end.

---

## Part 1: Try it on your own computer

This uses a **pretend ReachLMS** that comes with the code, so you can see the whole flow without touching your real system.

### 1.1 Install the tools (one time only)

1. **Node.js:** go to <https://nodejs.org> and install the **LTS** version (22 or newer). Accept the defaults.
2. **Git:** go to <https://git-scm.com/downloads> and install it. Accept the defaults.
3. Open a **terminal**:
   - **Windows:** Start menu, type **PowerShell**, open it.
   - **Mac:** press Cmd + Space, type **Terminal**, open it.
4. Check both installed. Type each line and press Enter:
   ```bash
   node -v
   ```
   ```bash
   git --version
   ```
   You should see a version number for each, e.g. `v22.12.0`. If the Node number is below 22.5, install the newer LTS version.

### 1.2 Download the code

In the terminal, run these one at a time:

```bash
git clone https://github.com/KyleRoets/H5P.LTI.git
```

```bash
cd H5P.LTI
```

```bash
git checkout reach-studio-lti-tool
```

```bash
npm install
```

You can skip the `git checkout` line once the pull request has been merged into `main`.

`npm install` takes about a minute. Warnings are fine; you're looking for no red `ERR!` lines.

### 1.3 Run the automatic tests

```bash
npm test
```

You should see 16 lines with ✓ ending in **`16/16 steps passed`**. Some red "Launch error" text in the middle is normal: the test deliberately sends fake and replayed logins to check they're rejected.

### 1.4 Start the tool and the pretend ReachLMS

You need **two terminal windows**, both in the `H5P.LTI` folder.

**Window 1: the tool.**

Mac:

```bash
ALLOW_INSECURE_PLATFORMS=true npm start
```

Windows (PowerShell):

```powershell
$env:ALLOW_INSECURE_PLATFORMS="true"; npm start
```

Wait for `Reach Studio listening on 3000`. Leave this window open.

**Window 2: the pretend ReachLMS.** Open a new terminal, go to the folder again with `cd H5P.LTI`, then:

```bash
npm run mock-canvas
```

Wait for `Mock ReachLMS running at http://localhost:4000`. Leave it open too.

### 1.5 Click through it

Open your web browser at **http://localhost:4000**. Each step says what you should see.

| # | Do this | You should see |
|---|---|---|
| 1 | Click **Install Reach Studio (Dynamic Registration)** | A pop-up "Install Reach Studio" with a list of what it adds |
| 2 | Click **Install** | "Reach Studio is registered" |
| 3 | Click **Close** | The page reloads and now has an editor box with a **Reach Studio** button |
| 4 | Click the **Reach Studio** button in the editor toolbar | The studio pop-up asking you to **Create your studio account**, with name and email already filled in |
| 5 | Type a password (8+ characters), click **Create my account** | An empty library: "Build your first interactive" |
| 6 | Click **+ Create new** | A gallery of 10 content types |
| 7 | Choose **Image Hotspots**, type a title, click **Upload** and pick any picture | The picture appears in the editor and in the **Live preview** on the right |
| 8 | Click on the picture in **Place hotspots** a couple of times, and type a title and text for each | Numbered markers appear; clicking one in the preview shows your text |
| 9 | Click **Save & insert** | The pop-up closes and your hotspot image is on the course page and works |
| 10 | Click **Reach Studio** again | You go straight into your library with no sign-in, because the account is now linked |
| 11 | Build a **Quiz** with 2–3 questions and click **Save** (not insert), then **← Library** | The quiz is listed in your library |
| 12 | Close the pop-up. Under Assignments click **+ Assignment → External Tool → Reach Studio** and click **Insert** on your quiz | "Cell quiz (3 pts)" (or your title) appears under Assignments |
| 13 | At the top right click **Student**, then **Open** on the assignment and answer the questions | At the end: your score and "✓ Score … sent to the gradebook" |
| 14 | Close it and click **Teacher** at the top right | Next to the assignment: **Gradebook: x/y** |

If all 14 steps worked, the system works. Press **Ctrl + C** in both terminal windows to stop it.

> The pretend ReachLMS forgets everything when you stop it. To start again from scratch, also delete the `data` folder inside `H5P.LTI`.

---

## Part 2: Put it on the internet (Render)

ReachLMS has to reach the tool over the internet on **https**. Netlify can't run this kind of app; Render can. The repository includes a Render setup file (`render.yaml`), so most settings fill in automatically.

### 2.1 Create the service

1. Merge the pull request first: on GitHub open **Pull requests → #1 → Ready for review → Merge pull request**. Or, in step 4 below, choose the `reach-studio-lti-tool` branch.
2. Go to <https://render.com> and sign up. Choosing **Sign in with GitHub** is easiest.
3. Click **New + → Blueprint**.
4. Connect GitHub if asked, choose the **KyleRoets/H5P.LTI** repository, then pick the branch.
5. Render reads `render.yaml` and shows a service called **reach-studio** with a 1 GB disk. It asks for one value:
   - **PUBLIC_URL**: type `https://reach-studio.onrender.com`. If Render tells you that name is taken, use the address it shows on the service page once created, and update this value after (see 2.2).
6. Click **Apply**. Render builds and starts the tool, which takes 3–6 minutes. Wait until the service shows **Live**.

> **Cost:** the Starter instance plus a 1 GB disk is about $7–8 a month. The free plan won't work: it has no disk, so all accounts and content would be lost on every restart.

### 2.2 Check the address

1. On the service page, copy the address at the top, e.g. `https://reach-studio-ab12.onrender.com`.
2. Go to **Environment**. Make sure **PUBLIC_URL** is **exactly** that address: `https://`, no slash at the end. If you change it, click **Save Changes** and wait for it to redeploy.
3. While you're on **Environment**, find **REGISTRATION_CODE** (Render made one up) and copy it. You'll need it in Part 3.

### 2.3 Check it's running

Open these in your browser, replacing the address with yours:

| Address | You should see |
|---|---|
| `https://YOUR-ADDRESS/health` | `{"ok":true}` |
| `https://YOUR-ADDRESS/` | A small "Reach Studio" welcome card |
| `https://YOUR-ADDRESS/.well-known/jwks.json` | Text starting with `{"keys":[{"kty":"RSA"` |

If all three work, the tool is online. **Write the address down**; it's used in the next parts.

> **Using your own domain** (e.g. `studio.reachlms.com`): in Render go to **Settings → Custom Domains**, add the domain, create the DNS record Render shows you, and change **PUBLIC_URL** to the new address. Do this **before** Part 3; changing the address later means reinstalling the tool in ReachLMS.

---

## Part 3: Install it into ReachLMS

You need a ReachLMS **admin** account. Do this in a **test/beta ReachLMS** first if you have one.

### 3.1 Install with Dynamic Registration (try this first)

1. Log in to ReachLMS as an admin and click **Admin** in the left menu, then your account (e.g. "ReachLMS" or "GLU").
2. Click **Developer Keys**.
3. Click **+ Developer Key**, then **+ LTI Registration**. On newer versions this is under **Admin → Apps → Manage → Install a New App → Dynamic Registration** instead.
4. Paste: `https://YOUR-ADDRESS/lti/register`, then click **Continue** or **Next**.
5. The Reach Studio install screen appears inside ReachLMS. Paste the **REGISTRATION_CODE** from step 2.2 and click **Install**.
6. When you see **"Reach Studio is registered"**, click **Close**.
7. ReachLMS shows a review screen listing what the tool can do: the editor button, assignment and module selection, course navigation, grade passback. Accept the defaults and click **Enable & Close** / **Install** / **Save**. The button name varies by version.
8. Back in **Developer Keys**, find **Reach Studio** and make sure its **State** switch is **ON**.

If your ReachLMS has no **LTI Registration** or **Dynamic Registration** option, use 3.2 instead.

### 3.2 Manual install (only if 3.1 isn't available)

1. **Admin → Developer Keys → + Developer Key → + LTI Key.**
2. Fill in:
   - **Key Name:** `Reach Studio`
   - **Redirect URIs:** `https://YOUR-ADDRESS/lti/launch`
   - **Method:** choose **Enter URL**, and paste `https://YOUR-ADDRESS/lti/canvas-config.json`
3. Click **Save**, then switch the new key's **State** to **ON**.
4. Copy the long number in the **Details** column. That's the **Client ID**.
5. Tell the tool about ReachLMS. It needs ReachLMS's **issuer**, which you can find by trying a launch:
   1. Do step 3.3 below, then open any page in a test course, edit it, and try the Reach Studio editor button.
   2. You'll get "This ReachLMS site is not registered with Reach Studio" showing **Issuer `…`** and **client ID `…`**. Write down the issuer.
6. In Render open your service, then **Shell**, and run this (one line), using your values:
   ```bash
   su-exec node npm run add-platform -- --issuer ISSUER_FROM_STEP_5 --client-id CLIENT_ID --base https://YOUR-REACHLMS-ADDRESS --name "ReachLMS"
   ```
   Keep the `su-exec node` at the start. It makes the change as the app's own user, so the app can still write to its database afterwards.

### 3.3 Turn it on for courses

On some versions Dynamic Registration does this for you. Check first: if **Reach Studio** is already listed under **Admin → Settings → Apps → View App Configurations**, skip to step 6.

1. Go to **Admin → Settings → Apps** tab.
2. Click **View App Configurations**, then **+ App**.
3. **Configuration Type:** **By Client ID**.
4. Paste the **Client ID** from Developer Keys (the number in the **Details** column).
5. Click **Submit**, then **Install**.
6. **Optional:** to put the button directly on the editor toolbar instead of inside the **Apps** menu, find Reach Studio in the app list, open its **⚙ settings**, and choose **Add to RCE toolbar** (some versions call it "favorite").

Installing at the top **Admin** account makes it available in every course. To pilot with a few courses first, install it in a **sub-account** or in a single course (**Course → Settings → Apps**) instead.

---

## Part 4: Test it in a real ReachLMS course

Use a sandbox or test course where you're the teacher.

### 4.1 Teacher: build and embed

| # | Do this | You should see |
|---|---|---|
| 1 | Open **Pages → + Page** (or edit an existing page) | The ReachLMS editor |
| 2 | In the editor toolbar click **Reach Studio**. If you don't see it, click the **plug icon (Apps)**, then **Reach Studio** | The studio pop-up: **Create your studio account** with your name and email filled in |
| 3 | Create your account | Your empty library, with a green "Insert mode" banner |
| 4 | **+ Create new → Image Hotspots**, upload a picture, add 2 hotspots, **Save & insert** | The pop-up closes and a placeholder or preview of the content appears in the editor |
| 5 | Click **Save** on the page | The page shows your interactive hotspot image, working |
| 6 | Open the editor button again | It goes straight into your library with no sign-in |
| 7 | Edit another page and **Insert** the same item from the library | It appears there too, so one item can be reused in many places |

### 4.2 Student view

1. In the course, go to **Settings** and click **Student View** (right-hand side).
2. Open the page from 4.1. **You should see** the content working, with no "Edit" button.
3. Click **Leave Student View** when done.

### 4.3 Graded activity

1. **Assignments → + Assignment.** Give it a name.
2. **Submission Type:** **External Tool**, then **Find**, then **Reach Studio**.
3. In the studio, create or pick a **Quiz** and click **Insert**. **You should see** the external tool box filled in, and the points set to the number of questions.
4. **Save & Publish.**
5. Go to **Student View**, open the assignment and complete the quiz. **You should see** "✓ Score x/y sent to the gradebook".
6. **Leave Student View**, open **Grades**. **You should see** the Test Student's score in the assignment's column.

### 4.4 Other places worth checking

- **Discussions:** the editor button works when writing a post.
- **Classic Quizzes:** the editor button works in a question's text.
- **New Quizzes:** check whether the editor button appears. Some versions don't show external editor tools there.
- **Modules → + → External Tool → Reach Studio:** adds an activity as a module item.
- **Phone:** open a page with embedded content on a phone. It should fit the screen and work by touch.

If everything in Part 4 worked, it's ready for teachers.

---

## Part 5: Rolling it out

1. **Pilot first:** install in one sub-account, or a few courses, for a couple of weeks.
2. **Tell teachers:**
   - Use the **Reach Studio** button in the editor (or the plug icon) to create content.
   - Create the account once; after that it opens straight away.
   - For marks in the gradebook, add it as an **Assignment → External Tool → Reach Studio**. Content added with the editor button isn't graded.
   - Editing an item in Reach Studio updates it everywhere it's used. Deleting it breaks those places.
3. **Backups:** in Render, the disk has daily snapshots on paid plans. Check **Disks** on your service. The disk holds every account, every piece of content, every upload and the tool's security key.
4. **Updates:** when new code is merged into `main` (or the branch Render watches), Render redeploys automatically. Your data on the disk is kept.

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| `npm test` or `npm start` fails with a syntax or "unsupported" error | Node.js is older than 22.5 | Install the current LTS from nodejs.org |
| `/health` doesn't load on Render | Still deploying, or the deploy failed | Render → your service → **Logs**. Wait for "Reach Studio listening" |
| Render log shows `EACCES` or permission denied on `/data` | Old version of the code | Make sure you deployed the latest commit, which includes `docker-entrypoint.sh` |
| Teachers' content disappears after a restart | No disk attached | Render → service → **Disks**: there must be a disk mounted at `/data` |
| "Registration failed … must use https" | ReachLMS isn't on https | ReachLMS must be on https for production |
| "Registration failed … (401/403)" | Registration link expired | Start the Dynamic Registration again from ReachLMS; the link is single use |
| "That installation code is not correct" | Wrong code | Copy **REGISTRATION_CODE** again from Render → **Environment** |
| "This ReachLMS site is not registered with Reach Studio" | The tool doesn't know this ReachLMS, or the issuer changed | Use the issuer and client ID shown on that screen with step 3.2.6 |
| "Launch failed: … signature" or "kid" | ReachLMS's public key address isn't reachable, or ReachLMS rotated keys | Check `https://YOUR-REACHLMS/api/lti/security/jwks` opens in a browser. If ReachLMS is self-hosted, its admin must make sure LTI keys are set up (`dynamic_settings.yml` → `lti-keys`) |
| "Launch failed: Unknown or expired launch state" | The page sat open more than 10 minutes, or the back button was used | Close the pop-up and click the button again |
| The pop-up says "refused to connect" or is blank | Something in front of the tool blocks framing | If you added a proxy or CDN, remove any `X-Frame-Options` or `frame-ancestors` header for the tool |
| No Reach Studio button in the editor | Not installed for this course, or it's under the Apps menu | Look under the **plug icon (Apps)**. Check **Settings → Apps** lists Reach Studio. Check the developer key is **ON** |
| Grade doesn't appear in the gradebook | Content was added with the editor button, not as an assignment; or the assignment's quiz has no correct answers marked | Create it via **Assignment → External Tool**; make sure every question has a correct answer ticked |
| "Score could not be sent to the gradebook" | The tool couldn't get permission from ReachLMS | Developer Keys → Reach Studio → check the key is ON and has the **Score** and **Line Item** scopes. Check Render **Logs** for the error text |
| YouTube video doesn't play | The school network blocks YouTube | Upload an MP4 instead |

If you get stuck, copy the exact error text plus the last 30 lines from Render → **Logs** and send them over.
