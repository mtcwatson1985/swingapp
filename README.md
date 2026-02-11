# Swing Capture Studio

A browser-based prototype app for golf swing capture and analysis.

## Features

- Dual camera live monitor for down-the-line + face-on views over Wi‑Fi.
- Tunable resolution/FPS targeting for low-latency preview.
- Impact-triggered recording using microphone spike detection.
- Manual shot recording with configurable pre-roll and post-roll windows.
- Instant replay controls (0.25x, 0.5x, 1x).
- Analysis editor:
  - Draw lines
  - Measure angles between lines
  - Trace clubhead path over the captured frame

## Run locally

Because camera APIs require a secure context, use localhost:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Notes

- Browser support is best in modern Safari/Chrome/Edge.
- Two external iPhones can be used by opening this app in both browsers and selecting each camera stream where available.
- Mobile browsers may require user interaction before audio capture can start.
