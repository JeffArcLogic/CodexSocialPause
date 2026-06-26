# Privacy

Codex Social Pause is designed to run locally.

## What It Reads

The native host inspects local Codex Desktop metadata to infer whether Codex is working, idle, disconnected, or waiting for you:

- `~/.codex`
- `~/.codex/sessions`
- `~/.codex/process_manager/chat_processes.json`
- `~/Library/Logs/com.openai.codex`

The current detector uses structural fields such as timestamps, event types, roles, phases, file modification times, and process metadata. It does not need prompt text, assistant response text, transcript contents, or log bodies for normal operation.

## What It Sends

The native host sends compact status messages to the browser extension through Chrome native messaging. Example:

```json
{"status":"waiting_on_user","reason":"last_event_waiting_on_user"}
```

## Network

The extension and native host do not upload Codex data to any server.

## Browser Access

The extension runs content scripts on supported distracting sites so it can blur the page, prevent scrolling, and pause media while Codex needs your attention.

## Current Scope

This is an early project. It is currently intended for local macOS + Chrome use.
