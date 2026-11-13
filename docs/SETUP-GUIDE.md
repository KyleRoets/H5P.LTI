# ReachStudio: setup and testing guide

This guide takes you from "the code is on GitHub" to "teachers are using it in ReachLMS". Work through the parts in order, and stop at a part if something doesn't match what's described.

| Part | What you do | Time | You need |
|---|---|---|---|
| **0** | **Quickest: try it in your browser, nothing to install** | **5 min** | **A GitHub login** |
| 1 | *(Optional)* Try it on your own computer instead | 20 min | A computer you can install software on |
| 2 | Put it on the internet (Render) | 30 min | A Render account and a payment card (about $7–8/month) |
| 3 | Install it into ReachLMS | 15 min | A ReachLMS **admin** login |
| 4 | Test it in a real ReachLMS course | 20 min | A test or sandbox course |
| 5 | Roll it out to teachers | – | – |

Troubleshooting is at the end.

---

## Part 0: Try it in your browser (quickest, nothing to install)

GitHub can run ReachStudio for you in the cloud (**GitHub Codespaces**). It's free for personal accounts: 60 hours a month. It starts in **demo mode**, so one web address gives you both ReachStudio and a pretend ReachLMS course to test it in.

1. Open **<https://codespaces.new/KyleRoets/H5P.LTI?ref=reach-studio-lti-tool>**. Once the pull request is merged you can use `?ref=main`, or the **Code → Codespaces** tab on the repository page.
2. Sign in to GitHub if asked and click **Create codespace**.
3. Wait 2–4 minutes while it sets up. An online editor opens and a terminal at the bottom runs `npm install`, then `npm run demo`.
4. When the terminal shows **ReachStudio listening on 3000**, a new browser tab opens with the pretend ReachLMS course.
   - **No tab opened?** Click the **Ports** tab next to the terminal, then the 🌐 globe icon next to port **3000**.
   - **Pop-up blocked?** Allow pop-ups for `github.dev`.
5. Follow the click-through checklist in **step 1.5** below, from step 1 ("Install ReachStudio").

**When you're done:** go to <https://github.com/codespaces>, then **⋯ → Stop codespace** (or Delete), so it doesn't use up your free hours. Everything you made in the demo is test data only.

> **Demo mode is for testing only.** Never point your real ReachLMS at an instance running in demo mode: anyone who opens `/demo` could act as the pretend ReachLMS.

If Part 0 worked, you can skip Part 1 and go straight to Part 2.

---

## Part 1: Try it on your own computer (optional)

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

Wait for `ReachStudio listening on 3000`. Leave this window open.

**Window 2: the pretend ReachLMS.** Open a new terminal, go to the folder again with `cd H5P.LTI`, then:

```bash
npm run mock-canvas
```

Wait for `Mock ReachLMS running at http://localhost:4000`. Leave it open too.

### 1.5 Click through it

Open your web browser at **http://localhost:4000** (in Codespaces, the tab that opened for you). Each step says what you should see.

| # | Do this | You should see |
|---|---|---|
| 1 | Click **Install ReachStudio (Dynamic Registration)** | A pop-up "Install ReachStudio" with a list of what it adds |
| 2 | Click **Install** | "ReachStudio is registered" |
| 3 | Click **Close** | The page reloads and now has an editor box with a **ReachStudio** button |
| 4 | Click the **ReachStudio** button in the editor toolbar | The studio pop-up asking you to **Create your studio account**, with name and email already filled in |
| 5 | Type a password (8+ characters), click **Create my account** | An empty library: "Build your first interactive" |
| 6 | Click **+ Create new**, then **Learn more** on any type | A gallery of 29 illustrated content types in four sections (with search); Learn more explains the type and lets you try a working example |
| 7 | Click **Create** on **Image Hotspots**, type a title, click the upload box and pick any picture | The picture appears in the editor and in the **Live preview** on the right |
| 8 | Click on the picture in **Place hotspots** a couple of times, and type a title and text for each | Numbered markers appear; clicking one in the preview shows your text |
| 9 | Click **Save & insert** | The pop-up closes and your hotspot image is on the course page and works |
| 10 | Click **ReachStudio** again | You go straight into your library with no sign-in, because the account is now linked |
| 11 | Build a **Quiz** with 2–3 questions (or use **Learn more → Start from this example**) and click **Save** (not insert), then **← Library** | The quiz is listed in your library |
| 12 | Close the pop-up. Under Assignments click **+ Assignment → External Tool → ReachStudio** and click **Insert** on your quiz | Your quiz appears under Assignments with its points (one per question) |
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
   - **ADMIN_EMAILS**: your email address, e.g. `kyle@youmultiply.com`. The account you create with this email gets the **Admin** view. Separate several emails with commas.
6. Click **Apply**. Render builds and starts the tool, which takes 3–6 minutes. Wait until the service shows **Live**.

> **Just want to try it on Render first?** Use **New + → Web Service** instead of Blueprint: pick the repository, Runtime **Docker**, the **Free** plan, and add the environment variable `DEMO_MODE` = `true`. Then open `https://YOUR-ADDRESS/demo/` and follow step 1.5. Data is wiped whenever the free service restarts, and it must not be connected to your real ReachLMS. For the real thing, use the Blueprint steps above.

> **Cost:** the Starter instance plus a 1 GB disk is about $7–8 a month. For real use the free plan won't work: it has no disk, so all accounts and content would be lost on every restart.

### 2.2 Check the address

1. On the service page, copy the address at the top, e.g. `https://reach-studio-ab12.onrender.com`.
2. Go to **Environment**. If you filled in **PUBLIC_URL**, make sure it is **exactly** that address: `https://`, no slash at the end. If you change it, click **Save Changes** and wait for it to redeploy.
3. While you're on **Environment**, find **REGISTRATION_CODE** (Render made one up) and copy it. You'll need it in Part 3.

### 2.3 Check it's running

Open these in your browser, replacing the address with yours:

| Address | You should see |
|---|---|
| `https://YOUR-ADDRESS/health` | `{"ok":true}` |
| `https://YOUR-ADDRESS/` | A small "ReachStudio" welcome card |
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
5. The ReachStudio install screen appears inside ReachLMS. Paste the **REGISTRATION_CODE** from step 2.2 and click **Install**.
6. When you see **"ReachStudio is registered"**, click **Close**.
7. ReachLMS shows a review screen listing what the tool can do: the editor button, assignment and module selection, course navigation, grade passback. Accept the defaults and click **Enable & Close** / **Install** / **Save**. The button name varies by version.
8. Back in **Developer Keys**, find **ReachStudio** and make sure its **State** switch is **ON**.

If your ReachLMS has no **LTI Registration** or **Dynamic Registration** option, use 3.2 instead.

### 3.2 Manual install (only if 3.1 isn't available)

1. **Admin → Developer Keys → + Developer Key → + LTI Key.**
2. Fill in:
   - **Key Name:** `ReachStudio`
   - **Redirect URIs:** `https://YOUR-ADDRESS/lti/launch`
   - **Method:** choose **Enter URL**, and paste `https://YOUR-ADDRESS/lti/canvas-config.json`
3. Click **Save**, then switch the new key's **State** to **ON**.
4. Copy the long number in the **Details** column. That's the **Client ID**.
5. Tell the tool about ReachLMS. It needs ReachLMS's **issuer**, which you can find by trying a launch:
   1. Do step 3.3 below, then open any page in a test course, edit it, and try the ReachStudio editor button.
   2. You'll get "This ReachLMS site is not registered with ReachStudio" showing **Issuer `…`** and **client ID `…`**. Write down the issuer.
6. In Render open your service, then **Shell**, and run this (one line), using your values:
   ```bash
   su-exec node npm run add-platform -- --issuer ISSUER_FROM_STEP_5 --client-id CLIENT_ID --base https://YOUR-REACHLMS-ADDRESS --name "ReachLMS"
   ```
   Keep the `su-exec node` at the start. It makes the change as the app's own user, so the app can still write to its database afterwards.

### 3.3 Turn it on for courses

On some versions Dynamic Registration does this for you. Check first: if **ReachStudio** is already listed under **Admin → Settings → Apps → View App Configurations**, skip to step 6.

1. Go to **Admin → Settings → Apps** tab.
2. Click **View App Configurations**, then **+ App**.
3. **Configuration Type:** **By Client ID**.
4. Paste the **Client ID** from Developer Keys (the number in the **Details** column).
5. Click **Submit**, then **Install**.
6. **Optional:** to put the button directly on the editor toolbar instead of inside the **Apps** menu, find ReachStudio in the app list, open its **⚙ settings**, and choose **Add to RCE toolbar** (some versions call it "favorite").

Installing at the top **Admin** account makes it available in every course. To pilot with a few courses first, install it in a **sub-account** or in a single course (**Course → Settings → Apps**) instead.

---

### 3.4 Optional: install ReachQuizzes (the Quizzes+ course menu item)

This is a second, small registration from the same ReachStudio server.
1. **Admin → Developer Keys → + Dynamic Registration**, and paste `https://YOUR-ADDRESS/lti/register?app=quizzes`.
2. Click **Install**, then switch the new **ReachQuizzes** key **ON**. Add it under **Settings → Apps** if it isn't listed there.
3. It is **off in every course** until a teacher switches it on, in **Settings → Navigation**: drag **Quizzes+** up, and optionally drag ReachLMS's own **Quizzes** down to hide it.

To change the menu label (for example to "Quizzes", "Quiz Hub" or "Assessments"), set `QUIZ_NAV_LABEL` on Render **before** step 1. ReachLMS saves the label when the tool is installed.

---

## Part 4: Test it in a real ReachLMS course

Use a sandbox or test course where you're the teacher.

### 4.1 Teacher: build and embed

| # | Do this | You should see |
|---|---|---|
| 1 | Open **Pages → + Page** (or edit an existing page) | The ReachLMS editor |
| 2 | In the editor toolbar click **ReachStudio**. If you don't see it, click the **plug icon (Apps)**, then **ReachStudio** | A large studio pop-up (1200 × 900, or as much of the window as fits): **Create your studio account** with your name and email filled in |
| 3 | Create your account | Your empty library, with a green "Insert mode" banner |
| 4 | **+ Create new → Image Hotspots**, upload a picture, add 2 hotspots, **Save & insert** | The pop-up closes and a placeholder or preview of the content appears in the editor |
| 5 | Click **Save** on the page | The page shows your interactive hotspot image, working |
| 6 | Open the editor button again | It goes straight into your library with no sign-in |
| 7 | Edit another page and **Insert** the same item from the library | It appears there too, so one item can be reused in many places |

### 4.2 Student view

1. In the course, go to **Settings** and click **Student View** (right-hand side).
2. Open the page from 4.1. **You should see** the content working, with no "Edit" button.
3. Click **Leave Student View** when done.

### 4.3 Graded activity and SpeedGrader

1. **Assignments → + Assignment.** Give it a name.
2. **Submission Type:** choose **ReachStudio** from the list. If it isn't listed, choose **External Tool**, then **Find**, then **ReachStudio**. Leave **Load in a new tab** unticked, so students stay in ReachLMS.
3. In the studio, create or pick a **Quiz**. Open its **Grading** tab to choose attempts and which score counts, then click **Insert**. **You should see** the tool filled in, and **Points** set to the quiz's score.
4. **Save & Publish.**
5. Go to **Student View**, open the assignment and complete the quiz, then press **Submit** in the bar at the top. **You should see** "Submitted — you scored x / y", with a copy of the submitted work underneath.
6. **Leave Student View** and open the assignment in **SpeedGrader**. **You should see** the Test Student's submission: the score filled in and, in the main panel, exactly what they did.
7. Repeat with an **Essay** whose Grading tab is set to **By the lecturer**. In SpeedGrader it shows as **Needs grading**, with the student's text. Type a grade in SpeedGrader as usual.
8. As the teacher, open the assignment itself. **You should see** a lecturer view with a **Student submissions** button listing everyone's attempts.

**Already installed ReachStudio before this update?** ReachLMS saves a tool's settings when it is installed. To get the bigger editor pop-up and the **ReachStudio** submission type, install it again:
- **Dynamic Registration (3.1):** run it again, then switch the new key on and turn off the old one.
- **Manual key (3.2):** edit the key and re-enter the configuration URL.

On the free Render plan you re-register after every deploy anyway.

### 4.4 ReachQuizzes (if installed)

1. In the course, **Settings → Navigation**: drag **Quizzes+** into the visible list, then **Save**.
2. Click **Quizzes+**, then **Add a quiz**. Pick a Quiz from your library, or create one.
3. Optionally, on its **Grading** tab, turn off *Show whether each answer is right or wrong* for exam mode.
4. Click **Publish**. **You should see** a new assignment with the same name on the **Assignments** page.
5. In **Student View**, open **Quizzes+**, take the quiz and press **Submit**. **You should see** it move to *Submitted*.
6. As the teacher, **SpeedGrader** shows the attempt and every answer. **Quizzes+ → Results** shows the same.

### 4.5 Other places worth checking

- **Discussions:** the editor button works when writing a post.
- **Classic Quizzes:** the editor button works in a question's text.
- **New Quizzes:** check whether the editor button appears. Some versions don't show external editor tools there.
- **Modules → + → External Tool → ReachStudio:** adds an activity as a module item.
- **Course menu:** in **Settings → Navigation**, drag **ReachStudio** into the visible list and **Save**. Clicking it opens your library inside the course, with the course menu still on the left (it never opens a new tab). Students don't see it.
- **Phone:** open a page with embedded content on a phone. It should fit the screen and work by touch.

If everything in Part 4 worked, it's ready for teachers.

---

## Part 5: Rolling it out

**Admin view:** sign in to ReachStudio with the email you put in `ADMIN_EMAILS` (in ReachLMS, or at `https://YOUR-ADDRESS/studio`). Click the **Admin** tab to see every teacher's account, how much they've created, and when they were last active. From there you can suspend, reactivate, make admin, or delete an account. **Forgotten passwords:** teachers who've used ReachStudio from ReachLMS before can open it from ReachLMS and choose **Forgot your password?** to set a new one. For anyone else, find them in the Admin tab, click the **key** button, and send them the one-time reset link (valid for 1 hour). To add another admin later, add their email to `ADMIN_EMAILS` in Render and redeploy. Or, in Render's **Shell**, run `su-exec node npm run make-admin -- their@email`.

1. **Pilot first:** install in one sub-account, or a few courses, for a couple of weeks.
2. **Tell teachers:**
   - Use the **ReachStudio** button in the editor (or the plug icon) to create content.
   - Create the account once; after that it opens straight away.
   - For marks in the gradebook, add it as an **Assignment → External Tool → ReachStudio**. Content added with the editor button isn't graded.
   - Editing an item in ReachStudio updates it everywhere it's used. Deleting it breaks those places.
3. **Backups:** in Render, the disk has daily snapshots on paid plans. Check **Disks** on your service. The disk holds every account, every piece of content, every upload and the tool's security key.
4. **Updates:** when new code is merged into `main` (or the branch Render watches), Render redeploys automatically. Your data on the disk is kept.

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| `npm test` or `npm start` fails with a syntax or "unsupported" error | Node.js is older than 22.5 | Install the current LTS from nodejs.org |
| `/health` doesn't load on Render | Still deploying, or the deploy failed | Render → your service → **Logs**. Wait for "ReachStudio listening" |
| Render log shows `EACCES` or permission denied on `/data` | Old version of the code | Make sure you deployed the latest commit, which includes `docker-entrypoint.sh` |
| SpeedGrader shows **Submission not found in ReachStudio** | ReachStudio's data was reset after the student submitted (for example a redeploy on the free Render plan, which has no persistent disk) | Grades in ReachLMS are kept. New attempts will open. Use a plan with a persistent disk so attempts are kept |
| SpeedGrader shows **Submission not available** with your role | The person opening it isn't a teacher, TA or designer of that course, or a ReachLMS admin | Open it from the course's own SpeedGrader. The message lists the role ReachLMS sent |
| Several **ReachStudio** entries in Developer Keys or Apps | ReachStudio was registered more than once | Keep the newest key ON. Delete or turn OFF the others, and remove old copies under **Settings → Apps**, so ReachLMS doesn't open older assignments with an old key |
| Teachers' content disappears after a restart | No disk attached | Render → service → **Disks**: there must be a disk mounted at `/data` |
| "Registration failed … must use https" | ReachLMS isn't on https | ReachLMS must be on https for production |
| "Registration failed … (401/403)" | Registration link expired | Start the Dynamic Registration again from ReachLMS; the link is single use |
| "That installation code is not correct" | Wrong code | Copy **REGISTRATION_CODE** again from Render → **Environment** |
| "This ReachLMS site is not registered with ReachStudio" | The tool doesn't know this ReachLMS, or the issuer changed | Use the issuer and client ID shown on that screen with step 3.2.6 |
| "Launch failed: … signature" or "kid" | ReachLMS's public key address isn't reachable, or ReachLMS rotated keys | Check `https://YOUR-REACHLMS/api/lti/security/jwks` opens in a browser. If ReachLMS is self-hosted, its admin must make sure LTI keys are set up (`dynamic_settings.yml` → `lti-keys`) |
| "Launch failed: Unknown or expired launch state" | The page sat open more than 10 minutes, or the back button was used | Close the pop-up and click the button again |
| The pop-up says "refused to connect" or is blank | Something in front of the tool blocks framing | If you added a proxy or CDN, remove any `X-Frame-Options` or `frame-ancestors` header for the tool |
| No ReachStudio button in the editor | Not installed for this course, or it's under the Apps menu | Look under the **plug icon (Apps)**. Check **Settings → Apps** lists ReachStudio. Check the developer key is **ON** |
| Grade doesn't appear in the gradebook | Content was added with the editor button, not as an assignment; or the assignment's quiz has no correct answers marked | Create it via **Assignment → External Tool**; make sure every question has a correct answer ticked |
| "Score could not be sent to the gradebook" | The tool couldn't get permission from ReachLMS | Developer Keys → ReachStudio → check the key is ON and has the **Score** and **Line Item** scopes. Check Render **Logs** for the error text |

If you get stuck, copy the exact error text plus the last 30 lines from Render → **Logs** and send them over.
