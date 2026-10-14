# Releasing webpify (internal builds)

webpify is shared internally through **GitHub Releases**. The [Release workflow](.github/workflows/release.yml) builds and tests everything and attaches the packages to a release. Colleagues install them by following [INSTALL.md](INSTALL.md).

Publishing to the Chrome Web Store and Mozilla's add-ons site is described in [docs/public-release.md](docs/public-release.md).

## What a release contains

| File | For |
|---|---|
| `webpify-chrome-<v>.zip` | Chrome, Edge, Brave: unzip and "Load unpacked". This is also the file for the Chrome Web Store. |
| `webpify-firefox-<v>-unsigned.xpi` | Zen, installed permanently after turning off `xpinstall.signatures.required`. In regular Firefox, a temporary add-on only. The same package goes to addons.mozilla.org, which signs it. |
| `webpify-source-<v>.zip` | The source code, which the AGPL requires us to offer. Mozilla's reviewers also rebuild from it. |

## Making a release

1. **Bump the version.** Use the same number in `extension/manifest.json` and `Cargo.toml`, e.g. `0.2.0`, then run `cargo test` once so `Cargo.lock` picks up the new version (`build.sh` and the workflow use `--locked`, which refuses a stale lock file).
2. **Commit, tag and push.** Give the commit a short message body saying what changed, written for users: addons.mozilla.org shows it as the version's release notes.
   ```bash
   git commit -a -m "Release 0.2.0" -m "Settings page and on-page notice in the bid look."
   git tag v0.2.0
   git push origin main v0.2.0
   ```
   The tag must be `v` plus the manifest version, or the workflow stops.
3. **Wait for the workflow.** The **Release** run on the repository's **Actions** tab takes about 5–10 minutes the first time and less once its cache is warm. It:
   - runs the Rust tests
   - builds the WebAssembly module
   - packages Chrome, Firefox and the source code
   - submits the Firefox package to addons.mozilla.org, once that is set up (below)
   - creates the release with notes that tell people which file to download
   - submits the Chrome package to the Chrome Web Store, once that is set up (docs/public-release.md)
   - checks that an ARM64 build gives the same `.wasm` as the x86_64 one, as Mozilla's reviewers need
4. **Tell the team.** Share the release link. People who installed webpify from a store get the update automatically once the store approves it; everyone else follows the "Updating" section of INSTALL.md.

**Trying a build without releasing:** on the **Actions** tab, open **Release**, click **Run workflow**, and download the packages from the run's **Artifacts** section. Nothing is published and nothing is signed.

**Building the packages locally:** `./release.sh` builds, tests and packages everything into `dist/`.

## addons.mozilla.org

webpify is listed on addons.mozilla.org (AMO). The first version was submitted by hand ([docs/public-release.md](docs/public-release.md#addonsmozillaorg)); after that, every tagged release is submitted by the workflow:

1. Sign in to <https://addons.mozilla.org> with the BID-owned account that owns the listing. Open **Tools → Manage API Keys** (<https://addons.mozilla.org/developers/addon/api/key/>) and generate credentials.
2. In the GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add two secrets:
   - `AMO_JWT_ISSUER`: the "JWT issuer" value
   - `AMO_JWT_SECRET`: the "JWT secret" value
3. From the next tagged release on, the workflow submits the Firefox package as a listed version, with the source zip, the release commit's message body as release notes, and [store/firefox/approval-notes.txt](store/firefox/approval-notes.txt) for the reviewers. It doesn't wait: Mozilla reviews and signs the version, then Firefox updates installed copies within a day.

Things to know:
- **Each version number can be submitted only once.** If a release needs fixing, bump the version and tag again. That's also why manual workflow runs never submit.
- **Mozilla may review a version by hand.** Reviewers rebuild from the source zip, following the approval notes and the "Building from source" section in the README. The arm64 job checks the build their default ARM64 machine makes.
- **No `update_url`.** AMO refuses it on listed add-ons and handles updates itself, so the Firefox package has none.
