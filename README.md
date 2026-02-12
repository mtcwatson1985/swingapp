# Swing Capture Studio

A browser-based prototype for golf swing capture, replay, and analysis.

## What works across devices

Browser camera access is local to each device:

- ✅ iPhone camera(s) in iPhone browser
- ✅ iPad camera(s) in iPad browser
- ✅ Desktop webcam/USB camera(s) in desktop browser
- ❌ iPad/iPhone directly using desktop-attached USB cameras
- ❌ One device directly reading another device's camera stream without a dedicated relay server/app

So this app is best used as a local capture/analysis app on each device, not as direct camera-sharing between devices.

## Main workflow

1. **Live tab**: start monitor, frame your swing, then tap **Record Shot**.
2. After recording finishes, app auto-switches to **Replay tab** and starts **0.25x** replay.
3. Use **Analysis tab** for line drawing, angle measurement, and clubhead trace.
4. Use **Settings tab** for camera selection, timing, and impact trigger.

## Run locally

```bash
python3 -m http.server 8080
```

Then open:

- <http://localhost:8080> on desktop
- `http://<YOUR_COMPUTER_IP>:8080` on phone/tablet (same Wi-Fi)

## If phone/tablet says “unreachable”

- Keep the server terminal running.
- Ensure all devices are on the same Wi-Fi.
- Re-check your computer IP (`ipconfig getifaddr en0` on many Macs).
- Disable VPN / Private Relay for testing.
- Allow local network/firewall access on the host computer.

## Notes

- On single-camera devices, second view may be hidden/unavailable.
- iOS Safari may require an explicit user tap before microphone/impact trigger works.
