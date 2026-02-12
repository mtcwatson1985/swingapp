# Swing Capture Studio

A browser-based prototype for golf swing capture, replay, analysis, and wireless camera relay.

## Key point about iPhone camera to iPad/TV

You **can** use iPhone as the camera and iPad/TV as the monitor in this build using the built-in WebRTC relay pairing flow:

1. Open app on iPhone and iPad/TV (same Wi-Fi preferred).
2. Go to **Settings → iPhone camera → iPad/TV monitor pairing**.
3. On iPhone tap **Start Sender + Generate Offer**, copy offer.
4. On iPad/TV paste offer, tap **Build Viewer Answer**, copy answer.
5. Back on iPhone paste answer, tap **Apply Viewer Answer**.
6. iPad/TV switches to **Live** and shows iPhone camera stream.

This enables iPhone → iPad/TV monitoring without a custom backend.

## Main workflow

1. **Live tab**: start monitor, frame your swing, tap **Record Shot**.
2. App auto-switches to **Replay** and starts **0.25x** playback.
3. **Analysis** tab: draw lines, measure angles, trace clubhead path.
4. **Settings** tab: camera, timing, impact trigger, and remote pairing.

## Run locally

```bash
python3 -m http.server 8080
```

Then open:

- <http://localhost:8080> on desktop
- `http://<YOUR_COMPUTER_IP>:8080` on phone/tablet (same Wi-Fi)

## Troubleshooting

- If phone/tablet says unreachable: keep server terminal running, verify same Wi-Fi, re-check host IP, disable VPN/Private Relay, and allow firewall/local network access.
- If pairing fails: regenerate a fresh offer/answer pair and retry.
- On single-camera devices, second local view may be hidden.

## GitHub PR note

If GitHub shows “This branch has conflicts that must be resolved,” that is branch history divergence (not app runtime behavior). Resolve conflicts in the PR branch (README, app.js, index.html, styles.css) and push again.
