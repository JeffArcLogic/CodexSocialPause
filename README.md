# Codex Social Pause

Codex Social Pause is a Chrome extension plus local native host that pauses distracting sites when Codex Desktop is waiting for you.

When Codex is working, social sites stay available. When Codex is idle or waiting for input, supported sites blur, scrolling is disabled, and playing media is paused.

## Status

Early proof of concept.

Currently tested on:

- macOS
- Google Chrome
- Codex Desktop local data under `~/.codex` and `~/Library/Logs/com.openai.codex`

Other browsers and operating systems are not supported yet.

## Supported Sites

- YouTube
- X / Twitter
- Reddit
- Instagram
- Facebook
- TikTok
- Threads
- Bluesky
- LinkedIn
- Tumblr
- Pinterest
- Spotify, behind the optional **Also pause Spotify** setting

## How It Works

The extension has three parts:

- A WXT Chrome extension.
- A local native messaging host.
- A local Codex status probe.

The probe watches local Codex Desktop session/log metadata and emits one of:

- `working`
- `waiting_on_user`
- `idle`
- `disconnected`

The extension blocks distracting sites only when the effective status is `waiting_on_user` or `idle`. The popup also includes a pause/resume override.

## Privacy

Codex Social Pause is local-first and does not upload Codex data.

The status probe reads local Codex metadata and structural transcript fields such as timestamps and event types. It is not designed to read or transmit prompt text, assistant text, transcript bodies, or log bodies.

See [PRIVACY.md](./PRIVACY.md).

## Install From Source

Install dependencies:

```sh
npm install
```

Build the extension:

```sh
npm run build
```

Install the native host manifest for Chrome:

```sh
npm run native:install
```

Load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `output/chrome-mv3`.

The popup should show **Source: Native host** when the native host is connected.

## Development

Run type checks:

```sh
npm run compile
```

Build:

```sh
npm run build
```

Inspect Codex status directly:

```sh
npm run probe:codex
```

Watch status changes:

```sh
npm run probe:codex:watch
```

Uninstall the native host manifest:

```sh
npm run native:uninstall
```

## Notes For Testers

This project currently uses a stable unpacked-extension key so the native host can allowlist a predictable Chrome extension ID. This is useful for local source installs.

If the popup shows **Source: Mock**, native messaging is not connected. Reload the extension, reinstall the native host, or check the native host log:

```sh
tail -n 80 /tmp/codex-social-pause-native-host.log
```

## License

MIT
