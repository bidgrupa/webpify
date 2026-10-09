# Releasing webpify (internal builds)

webpify is shared internally through **GitHub Releases**. The [Release workflow](.github/workflows/release.yml) builds and tests everything and attaches the packages to a release. Colleagues install them by following [INSTALL.md](INSTALL.md).

Publishing to the Chrome Web Store and Mozilla's add-ons site comes later; the steps are in [docs/public-release.md](docs/public-release.md).

## What a release contains

| File | For |
|---|---|
| `webpify-chrome-<v>.zip` | Chrome, Edge, Brave: unzip and "Load unpacked". This is also the file for the Chrome Web Store. |
| `webpify-firefox-<v>-unsigned.xpi` | Zen, installed permanently after turning off `xpinstall.signatures.required`. In regular Firefox, a temporary add-on only. |
| `webpify-firefox-<v>.xpi` | Firefox and Zen, signed by Mozilla: installs normally and updates itself. Only present when Mozilla signing is set up (below). |
| `updates.json` | Update feed for the signed `.xpi`. Installed copies check `releases/latest/download/updates.json`. |
| `webpify-source-<v>.zip` | The source code, which the AGPL requires us to offer. Mozilla's reviewers also rebuild from it. |

## Making a release

1. **Bump the version.** Use the same number in `extension/manifest.json` and `Cargo.toml`, e.g. `0.2.0`, then run `./build.sh` once so `Cargo.lock` picks up the new version. The workflow builds with `--locked` and fails if the lock file is stale.
2. **Commit, tag and push:**
   ```bash
   git commit -am "Release 0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```
   The tag must be `v` plus the manifest version, or the workflow stops.
3. **Wait for the workflow.** The **Release** run on the repository's **Actions** tab takes about 5–10 minutes the first time and less once its cache is warm. It:
   - runs the Rust tests
   - builds the WebAssembly module
   - packages Chrome, Firefox and the source code
   - signs the Firefox package, if Mozilla signing is set up
   - creates the release with notes that tell people which file to download
4. **Tell the team.** Share the release link. People who already have webpify follow the "Updating" section of INSTALL.md (people with the signed Firefox file get the update automatically).

**Trying a build without releasing:** on the **Actions** tab, open **Release**, click **Run workflow**, and download the packages from the run's **Artifacts** section. Nothing is published and nothing is signed.

**Building the packages locally:** `./release.sh` builds, tests and packages everything into `dist/`.

## Mozilla signing (optional, recommended for Firefox users)

Regular Firefox only keeps add-ons signed by Mozilla. Zen can do without it (see INSTALL.md), but signing also gives Zen users automatic updates and spares them the `about:config` step.

Signing is "unlisted": Mozilla signs the file, but webpify does not appear on addons.mozilla.org, and we keep hosting it on GitHub.

1. Sign in to <https://addons.mozilla.org> with a BID-owned account (not a personal one). Open **Tools → Manage API Keys** (<https://addons.mozilla.org/developers/addon/api/key/>) and generate credentials.
2. In the GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add two secrets:
   - `AMO_JWT_ISSUER`: the "JWT issuer" value
   - `AMO_JWT_SECRET`: the "JWT secret" value
3. From the next tagged release on, the workflow also uploads `webpify-firefox-<v>.xpi` and `updates.json`.

Things to know:
- **The ID is claimed for good.** The first signed upload ties the add-on ID `webpify@bid.agency` to that Mozilla account permanently.
- **Each version number can only be signed once.** If a release needs fixing, bump the version and tag again. That's also why manual workflow runs never sign.
- **Mozilla may review a version by hand.** Reviewers rebuild from the source zip, following the "Building from source" section in the README.
