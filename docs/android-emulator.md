# Android emulator and Maestro under WSL2 (spike for ticket #17)

## Verdict

**An Android emulator does not start under WSL2 on this host as the user is set up today.** It needs one change that requires administrator rights: the user must be in the `kvm` group. Until then the emulator refuses to boot. If that change is not wanted, the emulator has to run on the Windows side.

Evidence, from a user-space install on this host (WSL2, kernel 6.18, 12 cores, 15 GB RAM, `/dev/kvm` present, no sudo without a password):

- `/dev/kvm` exists and the CPU exposes `vmx`, so nested virtualization is on.
- `/dev/kvm` is `crw-rw---- root kvm`, and the user is not in `kvm` (`id` lists adm, cdrom, sudo, dip, plugdev, users, docker).
- `emulator -avd procurely -no-window` (Android Emulator 37.2.12, `system-images;android-34;google_apis;x86_64`, installed under `~/Android/sdk` without sudo) exits at once with `ERROR | x86_64 emulation currently requires hardware acceleration! ... This user doesn't have permissions to use KVM (/dev/kvm).`
- Software emulation is not an option: the x86_64 image refuses to run without acceleration, and an arm64 image on an x86 host would run on pure CPU emulation, which is not usable for UI flows.

The path was stopped there. Nothing was worked around, and no emulator was ever booted, so everything below the "Setup that was not run" heading is untested.

## Setup that was not run

### Option A: emulator inside WSL2

1. As an administrator: `sudo usermod -aG kvm "$USER"`, then `wsl --shutdown` from Windows and reopen the distro. `emulator -accel-check` must report KVM as usable.
2. Tooling in user space, no sudo (what the spike installed): JDK 17 in `~/Android/jdk17`, the Android command-line tools, `platform-tools`, `emulator` and `system-images;android-34;google_apis;x86_64` under `~/Android/sdk` (about 5 GB on disk), then `avdmanager create avd -n procurely -k "system-images;android-34;google_apis;x86_64" -d pixel_6`.
3. Boot with `emulator -avd procurely -no-window -no-audio -gpu swiftshader_indirect`, wait for `adb shell getprop sys.boot_completed` to print 1.
4. Inside the emulator the host is `10.0.2.2`, so the app needs `EXPO_PUBLIC_API_URL=http://10.0.2.2:<API_PORT>` and Metro on the host. Expo Go (or a development build) is installed on the emulator and opened against `exp://10.0.2.2:<METRO_PORT>`.
5. Native flows use the same steps as the web flow with an `appId` header instead of `url`, for example `appId: host.exp.exponent` for Expo Go.

Expect headless software GPU rendering to be slow on 12 cores; this was not measured.

### Option B: emulator on the Windows side

Install Android Studio on Windows (Windows Hypervisor Platform enabled), create the AVD there, and let the WSL side reach its adb server. In WSL2 with NAT networking, run `adb -a nodaemon server` on Windows and `adb -H <windows host ip> devices` in WSL (the host address is the default gateway in `ip route`). Maestro reads the same `ANDROID_ADB_SERVER_ADDRESS` environment variable. Metro and the API then have to be reachable from the emulator at the Windows host's address, which depends on WSL's port forwarding. This option was not tried.

## What works today: Maestro against the Expo web target

Maestro does not need an emulator for web. Maestro 2.11.0 drives headless Chromium through Selenium, so the saved flows run in WSL2 now. `scripts/install-maestro.sh` installs JDK 17 and Maestro into the home directory without sudo, and `make e2e` runs the flows (see the README).

Facts learned getting the flows to pass, worth knowing before writing more:

- A web flow needs `url:` in its header. With `appId:` Maestro reports "0 devices connected". A web run cannot take the address from `env` in the header, so the flows use `url: about:blank` and an `openLink: ${APP_URL}` step.
- `tapOn` and `assertVisible` match visible text and input placeholders, not `accessibilityLabel`. A button whose label differs from its accessible name (`Cost center PLANT1` is labelled `PLANT1`) is tapped by its visible text. Text is a full-match regex, so a text with a trailing date needs `.*`.
- The text fields have no placeholder (they have a label printed above), so the flows use `tapOn: below: "<label>"`.
- A second text field cannot be focused while the first one still has focus: the tap does not move focus and `inputText` lands in the first field. A tap on a button moves focus, so the flow fills one field per form where it can (the delivery note is left out for that reason). Not understood further.
- The first bundle can take longer than the default wait, so the flow waits up to two minutes for the sign-in screen.
- Screens are tall: the headless browser runs at 1280x2400 so that buttons below the fold count as visible.
- Switching person means opening the app again and signing out from home; there is no sign-out inside a detail screen.

## Can the flows join CI?

**Recommendation: yes, as a separate job that is not a required check at first, then promote it.** Do not add it to the required list on the strength of this spike alone.

Measured on this host (12 cores, warm Docker image and Metro cache), `make e2e` run ten times in a row, each time reseeding the database first:

- 10 of 10 passes, no retries, no flaky step.
- The flow itself took 1m43s to 1m47s each run. The whole command, including reseed and readiness checks with Metro already running, took 1m53s to 2m00s.
- The flow is dominated by Maestro's per-step waits and the web bundle, not by the API.

What the numbers do not cover: a cold CI runner. It adds the Docker build, `pnpm install`, the first Metro bundle (about 30 seconds locally, longer cold), the JDK and Maestro download, and a Chromium install. All ten runs were on one machine, one session and one seed, so they say nothing about runner-to-runner variance. The CI job needs a timeout of several minutes, well above the three minutes the current checks use.

Promote it to a required check after it has passed on CI runners for a stretch of pull requests (twenty runs without a flake is a reasonable bar). The flow never reuses state between runs: it reseeds and tags its requisition with a timestamp.
