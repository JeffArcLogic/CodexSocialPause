import {
  BLOCKER_STATE_STORAGE_KEY,
  type BackgroundStateMessage,
  type CodexBlockerState,
} from '@/lib/codex-status';

export default defineContentScript({
  matches: [
    '*://youtube.com/*',
    '*://*.youtube.com/*',
    '*://x.com/*',
    '*://*.x.com/*',
    '*://twitter.com/*',
    '*://*.twitter.com/*',
    '*://reddit.com/*',
    '*://*.reddit.com/*',
    '*://instagram.com/*',
    '*://*.instagram.com/*',
    '*://facebook.com/*',
    '*://*.facebook.com/*',
    '*://tiktok.com/*',
    '*://*.tiktok.com/*',
    '*://threads.net/*',
    '*://*.threads.net/*',
    '*://bsky.app/*',
    '*://*.bsky.app/*',
    '*://linkedin.com/*',
    '*://*.linkedin.com/*',
    '*://tumblr.com/*',
    '*://*.tumblr.com/*',
    '*://pinterest.com/*',
    '*://*.pinterest.com/*',
    '*://spotify.com/*',
    '*://*.spotify.com/*',
  ],
  main() {
    const overlayId = 'codex-social-blocker-overlay';
    const styleId = 'codex-social-blocker-style';
    const isSpotify =
      location.hostname === 'spotify.com' ||
      location.hostname.endsWith('.spotify.com');
    let isBlocking = false;
    let autoResumeVideos = true;
    let mediaPausedDuringCurrentBlock = new Set<HTMLMediaElement>();
    let spotifyPausedDuringCurrentBlock = false;
    let lockedScrollX = 0;
    let lockedScrollY = 0;

    const ensureStyle = () => {
      if (document.getElementById(styleId)) {
        return;
      }

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        html.codex-social-blocker-active,
        body.codex-social-blocker-active {
          overflow: hidden !important;
        }

        body.codex-social-blocker-active {
          position: fixed !important;
          width: 100% !important;
        }

        body.codex-social-blocker-active > *:not(#${overlayId}) {
          filter: blur(10px) !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        #${overlayId} {
          position: fixed;
          top: 18px;
          left: 50%;
          z-index: 2147483647;
          transform: translateX(-50%);
          max-width: min(420px, calc(100vw - 32px));
          padding: 12px 16px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          border-radius: 8px;
          background: #111827;
          color: #ffffff;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
          font: 600 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          text-align: center;
        }
      `;
      document.documentElement.append(style);
    };

    const pauseMedia = () => {
      document.querySelectorAll('audio, video').forEach((media) => {
        if (media instanceof HTMLMediaElement && !media.paused) {
          mediaPausedDuringCurrentBlock.add(media);
          media.pause();
        }
      });
    };

    const resumeMedia = () => {
      document.querySelectorAll('audio, video').forEach((media) => {
        if (
          !(media instanceof HTMLMediaElement) ||
          !mediaPausedDuringCurrentBlock.has(media)
        ) {
          return;
        }

        media.play().catch(() => {
          // Chrome can still reject programmatic playback in some contexts.
        });
      });

      mediaPausedDuringCurrentBlock.clear();
    };

    const findSpotifyControlButton = (mode: 'pause' | 'play') => {
      const playPauseButton = document.querySelector<HTMLButtonElement>(
        '[data-testid="control-button-playpause"]',
      );

      if (!playPauseButton || playPauseButton.disabled) {
        return undefined;
      }

      const label = playPauseButton.getAttribute('aria-label') ?? '';

      if (mode === 'pause' && label.toLowerCase().startsWith('pause')) {
        return playPauseButton;
      }

      if (mode === 'play' && label.toLowerCase().startsWith('play')) {
        return playPauseButton;
      }

      return undefined;
    };

    const pauseSpotify = () => {
      if (!isSpotify) {
        return;
      }

      const pauseButton = findSpotifyControlButton('pause');

      if (!pauseButton) {
        return;
      }

      pauseButton.click();
      spotifyPausedDuringCurrentBlock = true;
    };

    const resumeSpotify = () => {
      if (!isSpotify || !spotifyPausedDuringCurrentBlock) {
        return;
      }

      findSpotifyControlButton('play')?.click();
      spotifyPausedDuringCurrentBlock = false;
    };

    const showOverlay = () => {
      if (document.getElementById(overlayId)) {
        return;
      }

      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.textContent = 'Codex is waiting on you. Return to coding.';
      document.body.append(overlay);
    };

    const removeOverlay = () => {
      document.getElementById(overlayId)?.remove();
    };

    const lockScrollPosition = () => {
      lockedScrollX = window.scrollX;
      lockedScrollY = window.scrollY;
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = `-${lockedScrollX}px`;
    };

    const unlockScrollPosition = () => {
      document.body.style.top = '';
      document.body.style.left = '';
      window.scrollTo(lockedScrollX, lockedScrollY);
    };

    const setBlocking = (shouldBlock: boolean, shouldAutoResume = true) => {
      const wasBlocking = isBlocking;
      isBlocking = shouldBlock;
      autoResumeVideos = shouldAutoResume;

      if (shouldBlock) {
        if (!wasBlocking) {
          mediaPausedDuringCurrentBlock = new Set();
          spotifyPausedDuringCurrentBlock = false;
          lockScrollPosition();
        }

        ensureStyle();
        document.documentElement.classList.add('codex-social-blocker-active');
        document.body.classList.add('codex-social-blocker-active');
        showOverlay();
        if (!isSpotify) {
          pauseMedia();
        }
        pauseSpotify();
        return;
      }

      document.documentElement.classList.remove('codex-social-blocker-active');
      document.body.classList.remove('codex-social-blocker-active');
      removeOverlay();

      if (wasBlocking) {
        unlockScrollPosition();
      }

      if (wasBlocking && autoResumeVideos) {
        resumeMedia();
        resumeSpotify();
        return;
      }

      if (wasBlocking) {
        mediaPausedDuringCurrentBlock.clear();
        spotifyPausedDuringCurrentBlock = false;
      }
    };

    document.addEventListener(
      'play',
      (event) => {
        if (!isBlocking || !(event.target instanceof HTMLMediaElement)) {
          return;
        }

        mediaPausedDuringCurrentBlock.add(event.target);
        event.target.pause();
      },
      true,
    );

    const preventScroll = (event: Event) => {
      if (isBlocking) {
        event.preventDefault();
      }
    };

    const preventScrollKeys = (event: KeyboardEvent) => {
      if (
        !isBlocking ||
        ![
          ' ',
          'ArrowDown',
          'ArrowUp',
          'ArrowLeft',
          'ArrowRight',
          'End',
          'Home',
          'PageDown',
          'PageUp',
        ].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener('wheel', preventScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchmove', preventScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener('keydown', preventScrollKeys, true);

    const shouldBlockForPage = (state: CodexBlockerState | undefined) =>
      state?.shouldBlockSocial === true &&
      (!isSpotify || state.alsoPauseSpotify === true);

    const port = browser.runtime.connect({ name: 'codex-blocker:content' });
    port.onMessage.addListener((message: BackgroundStateMessage) => {
      if (message.type === 'codex-blocker:state-changed') {
        setBlocking(
          shouldBlockForPage(message.state),
          message.state.autoResumeVideos,
        );
      }
    });

    browser.storage.local.get(BLOCKER_STATE_STORAGE_KEY).then((stored) => {
      const state = stored[BLOCKER_STATE_STORAGE_KEY] as
        | CodexBlockerState
        | undefined;
      setBlocking(shouldBlockForPage(state), state?.autoResumeVideos !== false);
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      const change = changes[BLOCKER_STATE_STORAGE_KEY];
      const state = change?.newValue as CodexBlockerState | undefined;
      setBlocking(shouldBlockForPage(state), state?.autoResumeVideos !== false);
    });
  },
});
