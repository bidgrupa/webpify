# Installing webpify

webpify makes images smaller before you upload them. When you add images to an upload field on a site you've chosen (for example our CMS), it converts them to the WebP format first, and the site receives the smaller files.

This is an internal BID extension, so it isn't in the browser's extension store yet. Installing it takes about five minutes and is a little different for each browser. Follow the section for yours:

- [Chrome, Edge or Brave](#chrome-edge-or-brave)
- [Zen](#zen)
- [Firefox](#firefox)

Then [choose the sites where webpify should work](#choose-your-sites). That part is the same in every browser.

---

## Step 1: Download the right file

1. Open the **[latest release](../../releases/latest)** page.
2. Scroll down to **Assets** and click the file for your browser:

   | Your browser | File to download |
   |---|---|
   | Chrome, Edge or Brave | `webpify-chrome-…zip` |
   | Zen | `webpify-firefox-….xpi`. If there are two, pick the one **without** "unsigned". |
   | Firefox | `webpify-firefox-….xpi` **without** "unsigned". If there is only an "unsigned" file, see [Firefox](#firefox). |

   The "…" is the version number, for example `webpify-chrome-0.1.0.zip`.

---

## Chrome, Edge or Brave

### Unzip the download

- **Windows:** open your **Downloads** folder, right-click `webpify-chrome-….zip` and choose **Extract All…**, then **Extract**.
- **Mac:** open your **Downloads** folder and double-click `webpify-chrome-….zip`.

You now have a folder called `webpify-chrome-…`.

### Put the folder somewhere permanent

1. Move the folder to your **Documents** folder.
2. Rename it to **webpify**.

The browser loads webpify from this folder every time it starts. **Don't delete or move this folder later**, or webpify stops working.

### Add it to the browser

1. Click the address bar, type the address for your browser and press **Enter**:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Turn on **Developer mode**. In Chrome and Brave the switch is in the top-right corner; in Edge it's in the left-hand panel.
3. Click **Load unpacked**. In Chrome and Brave it's in the top-left; in Edge, near the top.
4. Select the **webpify** folder from your Documents folder and click **Select Folder** (on Mac: **Select**).
5. A **webpify** card appears in the list. You're done with this part.

**Show the webpify icon:** click the puzzle-piece icon to the right of the address bar, then click the pin next to **webpify**.

> Your browser may sometimes suggest turning off "developer mode" extensions. Keep them on (for example, click **Cancel** or close the message), otherwise webpify is switched off.

Next: [choose your sites](#choose-your-sites).

---

## Zen

**If the release has a file without "unsigned" in its name**, follow the [Firefox steps](#firefox) instead. You can skip the setting below.

### Allow internal add-ons (one time only)

The unsigned file isn't signed by Mozilla, so Zen has to be told to accept it.

1. Click the address bar, type `about:config` and press **Enter**.
2. If a warning appears, click **Accept the Risk and Continue**.
3. In the search box, type `xpinstall.signatures.required`.
4. Double-click the line that appears so its value changes from **true** to **false**.
5. Close this tab.

### Install webpify

1. Click the address bar, type `about:addons` and press **Enter**.
2. Click the gear icon ⚙ at the top and choose **Install Add-on From File…**.
3. Pick the `webpify-firefox-…-unsigned.xpi` file from your **Downloads** folder.
4. Click **Add** when Zen asks.

**Show the webpify icon:** open the extensions menu (puzzle-piece icon), click the gear next to **webpify** and choose **Pin to Toolbar**.

Next: [choose your sites](#choose-your-sites).

---

## Firefox

### With the signed file (`webpify-firefox-….xpi`, no "unsigned")

1. On the release page, click the file under **Assets**.
2. Firefox asks whether to allow github.com to install software. Click **Continue to Installation**.
3. Click **Add**, then **Okay**.

webpify stays installed and updates itself when a new version is released.

### If there is only an "unsigned" file

Regular Firefox only keeps add-ons that Mozilla has signed. Without the signed file you can still load webpify, but Firefox removes it every time it closes, so you'd have to repeat these steps after each restart.

1. Click the address bar, type `about:debugging#/runtime/this-firefox` and press **Enter**.
2. Click **Load Temporary Add-on…**.
3. Pick the `webpify-firefox-…-unsigned.xpi` file from your **Downloads** folder.

Ask the person who looks after webpify for a signed version if you need it every day.

**Show the webpify icon:** open the extensions menu (puzzle-piece icon), click the gear next to **webpify** and choose **Pin to Toolbar**.

---

## Choose your sites

webpify only works on sites you add. For our Lauris CMS, add both the live and the stage address. Do this once per site:

1. Click the **webpify** icon. The settings page opens.
2. Under **Sites**, next to **Lauris CMS**, click **admin.lauris.io**. This fills in `https://admin.lauris.io/*` for you.
3. Leave **Input / drop zone selector** empty.
4. Click **Add site**.
5. Your browser asks for permission to access that site. Click **Allow**.
6. Repeat steps 2–5 with **admin-stage.lauris.io** (`https://admin-stage.lauris.io/*`).
7. Reload any tabs where the CMS is already open.

For any other site, type its address in **Page pattern** with `/*` at the end (for example `https://www.example.com/*`) instead of clicking a preset.

That's it. Upload images as you normally would. A small dark notice in the bottom-right corner of the page shows that webpify is converting them and how much smaller they got.

### Settings worth knowing

- **Quality:** 80 is a good default. For photos on our CMS, 90 keeps more detail.
- **Max width/height:** big photos are scaled down to this size. 0 keeps the original size.
- **Keep the original when the WebP would be larger:** leave this on.

---

## Updating to a new version

When there's a new version, download the new file from the [latest release](../../releases/latest) as in [Step 1](#step-1-download-the-right-file).

- **Chrome, Edge, Brave:**
  1. Unzip the new file.
  2. Open your **webpify** folder in Documents, delete everything inside it, and copy in the files from the new folder. Use the same webpify folder, not a new one: a new folder counts as a new extension, and you'd have to add your sites again.
  3. Open the extensions page (`chrome://extensions`, `edge://extensions` or `brave://extensions`) and click the round arrow ↻ on the webpify card.
- **Zen:** install the new file the same way as the first time (`about:addons` → ⚙ → **Install Add-on From File…**). Your settings are kept.
- **Firefox with the signed file:** nothing to do. It updates itself.

---

## Something isn't working

- **Images are uploaded unchanged.**
  - Open the webpify settings and check that the site is listed and shows **Granted**. If it shows **Grant**, click it and allow access.
  - Reload the page and try again.
  - Some upload fields only accept JPEG or PNG; webpify leaves those alone on purpose.
- **"Manifest file is missing or unreadable"** when loading in Chrome, Edge or Brave: you picked the wrong folder. Pick the folder that directly contains a file called `manifest.json`. After unzipping, that is sometimes one folder deeper.
- **Linux only: the extensions page can't open the folder or file.** Browsers installed from Flathub can only see a few folders. Ask the person who looks after webpify for help.
- **To remove webpify:**
  - Chrome, Edge or Brave: on the extensions page, click **Remove** on the webpify card, then delete the webpify folder.
  - Zen or Firefox: in `about:addons`, click the three dots next to webpify and choose **Remove**.
