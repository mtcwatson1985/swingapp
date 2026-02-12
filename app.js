const state = {
  streamA: null,
  streamB: null,
  rollingRecorderA: null,
  rollingRecorderB: null,
  rollingChunksA: [],
  rollingChunksB: [],
  replayUrlA: '',
  replayUrlB: '',
  isRecordingShot: false,
  impactEnabled: false,
  audioContext: null,
  analyser: null,
  micStream: null,
  impactCooldown: false,
  overlayImage: null,
  lineDraft: [],
  angleDraft: [],
  tracePoints: [],
  savedLines: [],
  savedAngles: [],
  senderPeer: null,
  viewerPeer: null,
  senderStream: null,
  remoteViewerStream: null
};

const ui = {
  views: Array.from(document.querySelectorAll('.view')),
  tabs: Array.from(document.querySelectorAll('.tab')),
  cameraA: document.getElementById('cameraA'),
  cameraB: document.getElementById('cameraB'),
  resolution: document.getElementById('resolution'),
  fpsTarget: document.getElementById('fpsTarget'),
  preRollSeconds: document.getElementById('preRollSeconds'),
  postRollSeconds: document.getElementById('postRollSeconds'),
  impactThreshold: document.getElementById('impactThreshold'),
  impactValue: document.getElementById('impactValue'),
  refreshCameras: document.getElementById('refreshCameras'),
  startMonitor: document.getElementById('startMonitor'),
  stopMonitor: document.getElementById('stopMonitor'),
  toggleImpact: document.getElementById('toggleImpact'),
  manualRecord: document.getElementById('manualRecord'),
  status: document.getElementById('status'),
  videoA: document.getElementById('videoA'),
  videoB: document.getElementById('videoB'),
  feedBCard: document.getElementById('feedBCard'),
  replayA: document.getElementById('replayA'),
  replayB: document.getElementById('replayB'),
  replayBCard: document.getElementById('replayBCard'),
  instantReplay: document.getElementById('instantReplay'),
  halfReplay: document.getElementById('halfReplay'),
  normalReplay: document.getElementById('normalReplay'),
  editorSource: document.getElementById('editorSource'),
  toolMode: document.getElementById('toolMode'),
  captureFrame: document.getElementById('captureFrame'),
  clearOverlays: document.getElementById('clearOverlays'),
  analysisCanvas: document.getElementById('analysisCanvas'),
  measurements: document.getElementById('measurements'),
  startSender: document.getElementById('startSender'),
  senderOffer: document.getElementById('senderOffer'),
  copySenderOffer: document.getElementById('copySenderOffer'),
  senderAnswerIn: document.getElementById('senderAnswerIn'),
  applySenderAnswer: document.getElementById('applySenderAnswer'),
  viewerOfferIn: document.getElementById('viewerOfferIn'),
  buildViewerAnswer: document.getElementById('buildViewerAnswer'),
  viewerAnswer: document.getElementById('viewerAnswer'),
  copyViewerAnswer: document.getElementById('copyViewerAnswer'),
  secureContextNote: document.getElementById('secureContextNote'),
  settingsStatus: document.getElementById('settingsStatus')
};

const ctx = ui.analysisCanvas.getContext('2d');

function setStatus(message) {
  ui.status.textContent = `Status: ${message}`;
  if (ui.settingsStatus) {
    ui.settingsStatus.textContent = `Status: ${message}`;
  }
}

function switchView(target) {
  ui.views.forEach((view) => view.classList.toggle('active', view.dataset.view === target));
  ui.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.target === target));
}

function parseResolution() {
  const [width, height] = ui.resolution.value.split('x').map(Number);
  return { width, height };
}

function chooseSupportedMime() {
  const mimes = [
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function browserSupportsCamera() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function browserSupportsWebRtc() {
  return Boolean(window.RTCPeerConnection);
}

function addCameraOptions(select, devices) {
  select.innerHTML = '';
  [
    { value: 'environment', label: 'Back Camera (recommended mobile)' },
    { value: 'user', label: 'Front Camera (selfie)' }
  ].forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.value;
    opt.textContent = preset.label;
    select.appendChild(opt);
  });

  devices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    select.appendChild(option);
  });
}

async function listCameras() {
  if (!browserSupportsCamera()) {
    setStatus('camera APIs unavailable in this browser/context');
    if (ui.cameraA) ui.cameraA.innerHTML = '<option>Camera API unavailable</option>';
    if (ui.cameraB) ui.cameraB.innerHTML = '<option>Camera API unavailable</option>';
    return;
  }

  try {
    const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    temp.getTracks().forEach((track) => track.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((device) => device.kind === 'videoinput');

    addCameraOptions(ui.cameraA, videos);
    addCameraOptions(ui.cameraB, videos);

    if (videos.length > 1) {
      ui.cameraA.value = videos[0].deviceId;
      ui.cameraB.value = videos[1].deviceId;
      setStatus(`cameras ready (${videos.length} found)`);
    } else if (videos.length === 1) {
      ui.cameraA.value = videos[0].deviceId;
      ui.cameraB.value = 'environment';
      setStatus('one camera found; second view may be unavailable on this device');
    } else {
      ui.cameraA.value = 'environment';
      ui.cameraB.value = 'user';
      setStatus('no labelled cameras found; using front/back presets');
    }
  } catch (error) {
    setStatus(`unable to enumerate cameras (${error.message})`);
  }
}

function streamConstraints(selection) {
  const { width, height } = parseResolution();
  const fps = Number(ui.fpsTarget.value);
  const base = { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } };

  if (selection === 'environment' || selection === 'user') {
    return { video: { ...base, facingMode: { ideal: selection } }, audio: false };
  }

  return { video: { ...base, deviceId: { exact: selection } }, audio: false };
}

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function trimRollingChunks() {
  const now = Date.now();
  const keepMs = Math.max(0, Number(ui.preRollSeconds.value)) * 1000;
  state.rollingChunksA = state.rollingChunksA.filter((entry) => now - entry.time <= keepMs);
  state.rollingChunksB = state.rollingChunksB.filter((entry) => now - entry.time <= keepMs);
}

function attachRollingRecorder(stream, side) {
  const mimeType = chooseSupportedMime();
  if (!mimeType) {
    setStatus('recording not supported in this browser');
    return null;
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) return;
    const entry = { blob: event.data, time: Date.now() };
    if (side === 'A') {
      state.rollingChunksA.push(entry);
    } else {
      state.rollingChunksB.push(entry);
    }
    trimRollingChunks();
  };
  recorder.start(250);
  return recorder;
}

function getStreamLabel(hasSecond) {
  if (hasSecond) return 'dual monitor active';
  return 'single camera active (second view unavailable on this device)';
}

async function startMonitoring() {
  try {
    await stopMonitoring();

    state.streamA = await navigator.mediaDevices.getUserMedia(streamConstraints(ui.cameraA.value));
    ui.videoA.srcObject = state.streamA;

    try {
      state.streamB = await navigator.mediaDevices.getUserMedia(streamConstraints(ui.cameraB.value));
      ui.videoB.srcObject = state.streamB;
      ui.feedBCard.classList.remove('hidden');
      ui.replayBCard.classList.remove('hidden');
    } catch {
      state.streamB = null;
      ui.videoB.srcObject = null;
      ui.feedBCard.classList.add('hidden');
      ui.replayBCard.classList.add('hidden');
    }

    state.rollingChunksA = [];
    state.rollingChunksB = [];
    state.rollingRecorderA = attachRollingRecorder(state.streamA, 'A');
    if (state.streamB) {
      state.rollingRecorderB = attachRollingRecorder(state.streamB, 'B');
    }

    ui.startMonitor.disabled = true;
    ui.stopMonitor.disabled = false;
    ui.manualRecord.disabled = false;
    ui.toggleImpact.disabled = false;
    ui.captureFrame.disabled = false;
    setStatus(getStreamLabel(Boolean(state.streamB)));
  } catch (error) {
    setStatus(`failed to start monitor (${error.message})`);
  }
}

function stopRecorder(recorder) {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === 'inactive') {
      resolve();
      return;
    }
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.stop();
  });
}

async function stopMonitoring() {
  await disableImpactTrigger();
  await Promise.all([stopRecorder(state.rollingRecorderA), stopRecorder(state.rollingRecorderB)]);
  state.rollingRecorderA = null;
  state.rollingRecorderB = null;

  stopStream(state.streamA);
  stopStream(state.streamB);
  state.streamA = null;
  state.streamB = null;
  ui.videoA.srcObject = null;
  ui.videoB.srcObject = null;

  ui.startMonitor.disabled = false;
  ui.stopMonitor.disabled = true;
  ui.manualRecord.disabled = true;
  ui.toggleImpact.disabled = true;
  ui.captureFrame.disabled = true;

  if (!state.isRecordingShot) {
    setStatus('monitor stopped');
  }
}

function collectPreRoll(side) {
  const source = side === 'A' ? state.rollingChunksA : state.rollingChunksB;
  return source.map((entry) => entry.blob);
}

async function recordSingleStream(stream, side) {
  if (!stream) return null;
  const mimeType = chooseSupportedMime();
  if (!mimeType) return null;

  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(250);
  await new Promise((resolve) => setTimeout(resolve, Number(ui.postRollSeconds.value) * 1000));
  await stopRecorder(recorder);

  const preRoll = collectPreRoll(side);
  return new Blob([...preRoll, ...chunks], { type: mimeType });
}

function setReplaySource(video, nextBlob, oldUrlKey) {
  if (state[oldUrlKey]) {
    URL.revokeObjectURL(state[oldUrlKey]);
  }
  const nextUrl = URL.createObjectURL(nextBlob);
  state[oldUrlKey] = nextUrl;
  video.src = nextUrl;
}

async function recordShot(trigger = 'manual') {
  if (!state.streamA || state.isRecordingShot) {
    return;
  }

  state.isRecordingShot = true;
  ui.manualRecord.disabled = true;
  setStatus(`recording shot (${trigger})`);

  try {
    const [blobA, blobB] = await Promise.all([
      recordSingleStream(state.streamA, 'A'),
      state.streamB ? recordSingleStream(state.streamB, 'B') : Promise.resolve(null)
    ]);

    if (!blobA || blobA.size === 0) {
      throw new Error('empty recording generated');
    }

    setReplaySource(ui.replayA, blobA, 'replayUrlA');

    if (blobB && blobB.size > 0) {
      setReplaySource(ui.replayB, blobB, 'replayUrlB');
      ui.replayBCard.classList.remove('hidden');
    }

    ui.instantReplay.disabled = false;
    ui.halfReplay.disabled = false;
    ui.normalReplay.disabled = false;

    switchView('replay');
    replayAtRate(0.25);
    setStatus('shot captured and replay ready');
  } catch (error) {
    setStatus(`recording failed (${error.message})`);
  } finally {
    state.isRecordingShot = false;
    if (state.streamA) {
      ui.manualRecord.disabled = false;
    }
  }
}

async function enableImpactTrigger() {
  if (state.impactEnabled) return;
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.audioContext = new AudioContext();
    const source = state.audioContext.createMediaStreamSource(state.micStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    source.connect(state.analyser);

    const data = new Uint8Array(state.analyser.frequencyBinCount);
    const threshold = () => Number(ui.impactThreshold.value);

    const detect = () => {
      if (!state.impactEnabled || !state.analyser) return;
      state.analyser.getByteFrequencyData(data);
      const average = data.reduce((a, b) => a + b, 0) / data.length;
      const dbApprox = 20 * Math.log10(Math.max(average / 255, 0.0001));

      if (dbApprox > threshold() && !state.impactCooldown && !state.isRecordingShot) {
        state.impactCooldown = true;
        recordShot('impact');
        setTimeout(() => {
          state.impactCooldown = false;
        }, 1500);
      }
      requestAnimationFrame(detect);
    };

    state.impactEnabled = true;
    detect();
    ui.toggleImpact.textContent = 'Disable Impact Trigger';
    setStatus('impact trigger listening');
  } catch (error) {
    setStatus(`impact trigger unavailable (${error.message})`);
  }
}

async function disableImpactTrigger() {
  state.impactEnabled = false;
  if (state.micStream) stopStream(state.micStream);
  state.micStream = null;

  if (state.audioContext) await state.audioContext.close();
  state.audioContext = null;
  state.analyser = null;
  ui.toggleImpact.textContent = 'Enable Impact Trigger';
}

async function toggleImpactTrigger() {
  if (state.impactEnabled) {
    await disableImpactTrigger();
    setStatus('impact trigger disabled');
  } else {
    await enableImpactTrigger();
  }
}

function replayAtRate(rate) {
  [ui.replayA, ui.replayB].forEach((video) => {
    if (!video.src) return;
    video.currentTime = 0;
    video.playbackRate = rate;
    video.play();
  });
  setStatus(`replaying at ${rate}x`);
}

function updateCompatibilityHints() {
  if (!ui.secureContextNote) return;

  const secure = window.isSecureContext;
  const cam = browserSupportsCamera();
  const rtc = browserSupportsWebRtc();

  if (!secure) {
    ui.secureContextNote.textContent = 'This page is not in a secure context. Use https:// or localhost for camera and WebRTC access.';
  } else if (!cam) {
    ui.secureContextNote.textContent = 'Camera API is unavailable in this browser. Try Safari/Chrome and allow camera permissions.';
  } else if (!rtc) {
    ui.secureContextNote.textContent = 'WebRTC API unavailable in this browser, so sender/viewer pairing will not work.';
  } else {
    ui.secureContextNote.textContent = 'Compatibility check passed: camera + WebRTC APIs detected.';
  }
}

function createPeerConnection() {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'connected') {
      setStatus('remote link connected');
      switchView('live');
    }
    if (peer.connectionState === 'failed') {
      setStatus('remote link failed, restart pairing');
    }
  });

  return peer;
}

function waitIceComplete(peer) {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const onChange = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    peer.addEventListener('icegatheringstatechange', onChange);
    setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, 3000);
  });
}

async function startSenderFlow() {
  try {
    if (!browserSupportsCamera()) {
      setStatus('cannot start sender: camera API unavailable');
      return;
    }
    if (!browserSupportsWebRtc()) {
      setStatus('cannot start sender: WebRTC API unavailable');
      return;
    }

    ui.senderOffer.value = '';
    if (state.senderPeer) state.senderPeer.close();
    stopStream(state.senderStream);

    state.senderStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    ui.videoA.srcObject = state.senderStream;
    ui.feedBCard.classList.add('hidden');

    state.senderPeer = createPeerConnection();
    state.senderStream.getTracks().forEach((track) => state.senderPeer.addTrack(track, state.senderStream));

    const offer = await state.senderPeer.createOffer();
    await state.senderPeer.setLocalDescription(offer);
    await waitIceComplete(state.senderPeer);

    if (!state.senderPeer.localDescription) {
      throw new Error('offer not generated (no localDescription)');
    }
    ui.senderOffer.value = JSON.stringify(state.senderPeer.localDescription);
    setStatus('sender offer generated, copy to viewer device');
  } catch (error) {
    setStatus(`sender setup failed (${error.message})`);
  }
}

async function applySenderAnswer() {
  try {
    if (!state.senderPeer) {
      setStatus('start sender first');
      return;
    }
    if (!ui.senderAnswerIn.value.trim()) {
      setStatus('paste viewer answer first');
      return;
    }
    const answer = JSON.parse(ui.senderAnswerIn.value);
    await state.senderPeer.setRemoteDescription(answer);
    setStatus('viewer answer applied, waiting for connection');
  } catch (error) {
    setStatus(`invalid viewer answer (${error.message})`);
  }
}

async function buildViewerAnswer() {
  try {
    if (!browserSupportsWebRtc()) {
      setStatus('cannot build viewer answer: WebRTC API unavailable');
      return;
    }

    if (state.viewerPeer) state.viewerPeer.close();
    state.viewerPeer = createPeerConnection();

    state.viewerPeer.ontrack = (event) => {
      if (!state.remoteViewerStream) {
        state.remoteViewerStream = new MediaStream();
      }
      state.remoteViewerStream.addTrack(event.track);
      ui.videoA.srcObject = state.remoteViewerStream;
      ui.feedBCard.classList.add('hidden');
      ui.startMonitor.disabled = true;
      ui.stopMonitor.disabled = true;
      setStatus('remote camera stream received in live view');
      switchView('live');
    };

    if (!ui.viewerOfferIn.value.trim()) {
      setStatus('paste sender offer first');
      return;
    }
    const offer = JSON.parse(ui.viewerOfferIn.value);
    await state.viewerPeer.setRemoteDescription(offer);
    const answer = await state.viewerPeer.createAnswer();
    await state.viewerPeer.setLocalDescription(answer);
    await waitIceComplete(state.viewerPeer);

    ui.viewerAnswer.value = JSON.stringify(state.viewerPeer.localDescription);
    setStatus('viewer answer generated, copy back to sender device');
  } catch (error) {
    setStatus(`viewer setup failed (${error.message})`);
  }
}

async function copyText(value, successMessage) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage);
  } catch {
    setStatus('clipboard blocked by browser, copy manually');
  }
}

function drawAnalysis() {
  ctx.clearRect(0, 0, ui.analysisCanvas.width, ui.analysisCanvas.height);

  if (state.overlayImage) {
    ctx.drawImage(state.overlayImage, 0, 0, ui.analysisCanvas.width, ui.analysisCanvas.height);
  }

  ctx.lineWidth = 3;

  state.savedLines.forEach((line) => {
    ctx.strokeStyle = '#2fd4b1';
    ctx.beginPath();
    ctx.moveTo(line.p1.x, line.p1.y);
    ctx.lineTo(line.p2.x, line.p2.y);
    ctx.stroke();
  });

  state.savedAngles.forEach(({ p1, vertex, p3, angle }) => {
    ctx.strokeStyle = '#f0f3ff';
    ctx.beginPath();
    ctx.moveTo(vertex.x, vertex.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(vertex.x, vertex.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.fillStyle = '#ffb703';
    ctx.fillText(`${angle.toFixed(1)}°`, vertex.x + 8, vertex.y - 8);
  });

  if (state.tracePoints.length > 1) {
    ctx.strokeStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(state.tracePoints[0].x, state.tracePoints[0].y);
    state.tracePoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  }

  state.tracePoints.forEach((point) => drawPoint(point, '#ff4d6d', 4));
  state.angleDraft.forEach((point) => drawPoint(point, '#ffb703', 4));
}

function drawPoint(point, color, radius = 5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function canvasCoordinates(event) {
  const rect = ui.analysisCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * ui.analysisCanvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * ui.analysisCanvas.height;
  return { x, y };
}

function measureAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  const safe = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return Math.acos(safe) * (180 / Math.PI);
}

function onCanvasClick(event) {
  const point = canvasCoordinates(event);
  const mode = ui.toolMode.value;

  if (mode === 'line') {
    state.lineDraft.push(point);
    if (state.lineDraft.length === 2) {
      state.savedLines.push({ p1: state.lineDraft[0], p2: state.lineDraft[1] });
      state.lineDraft = [];
    }
  }

  if (mode === 'angle') {
    state.angleDraft.push(point);
    if (state.angleDraft.length === 3) {
      const [p1, vertex, p3] = state.angleDraft;
      const angle = measureAngle(p1, vertex, p3);
      state.savedAngles.push({ p1, vertex, p3, angle });
      ui.measurements.textContent = `Measurements: latest angle ${angle.toFixed(1)}°.`;
      state.angleDraft = [];
    }
  }

  if (mode === 'trace') {
    state.tracePoints.push(point);
    ui.measurements.textContent = `Measurements: trace points ${state.tracePoints.length}.`;
  }

  drawAnalysis();
}

function currentReplayElement() {
  return ui.editorSource.value === 'A' ? ui.replayA : ui.replayB;
}

function captureReplayFrame() {
  const source = currentReplayElement();
  if (!source.src || source.readyState < 2) {
    setStatus('load a replay first before capturing a frame');
    return;
  }

  const temp = document.createElement('canvas');
  temp.width = source.videoWidth || 960;
  temp.height = source.videoHeight || 540;
  const tempCtx = temp.getContext('2d');
  tempCtx.drawImage(source, 0, 0, temp.width, temp.height);

  state.overlayImage = new Image();
  state.overlayImage.onload = drawAnalysis;
  state.overlayImage.src = temp.toDataURL('image/png');
  setStatus(`captured ${ui.editorSource.value} frame for analysis`);
}

function clearOverlays() {
  state.savedLines = [];
  state.savedAngles = [];
  state.tracePoints = [];
  state.lineDraft = [];
  state.angleDraft = [];
  ui.measurements.textContent = 'Measurements: none yet.';
  drawAnalysis();
}

ui.tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.target));
});
ui.impactThreshold.addEventListener('input', () => {
  ui.impactValue.textContent = `${ui.impactThreshold.value} dB`;
});
ui.refreshCameras.addEventListener('click', listCameras);
ui.startMonitor.addEventListener('click', startMonitoring);
ui.stopMonitor.addEventListener('click', stopMonitoring);
ui.manualRecord.addEventListener('click', () => recordShot('manual'));
ui.toggleImpact.addEventListener('click', toggleImpactTrigger);
ui.instantReplay.addEventListener('click', () => replayAtRate(0.25));
ui.halfReplay.addEventListener('click', () => replayAtRate(0.5));
ui.normalReplay.addEventListener('click', () => replayAtRate(1));
ui.captureFrame.addEventListener('click', captureReplayFrame);
ui.clearOverlays.addEventListener('click', clearOverlays);
ui.analysisCanvas.addEventListener('click', onCanvasClick);
ui.startSender.addEventListener('click', startSenderFlow);
ui.applySenderAnswer.addEventListener('click', applySenderAnswer);
ui.buildViewerAnswer.addEventListener('click', buildViewerAnswer);
ui.copySenderOffer.addEventListener('click', () => copyText(ui.senderOffer.value, 'sender offer copied'));
ui.copyViewerAnswer.addEventListener('click', () => copyText(ui.viewerAnswer.value, 'viewer answer copied'));

window.addEventListener('beforeunload', () => {
  stopMonitoring();
  stopStream(state.senderStream);
  if (state.senderPeer) state.senderPeer.close();
  if (state.viewerPeer) state.viewerPeer.close();
  if (state.replayUrlA) URL.revokeObjectURL(state.replayUrlA);
  if (state.replayUrlB) URL.revokeObjectURL(state.replayUrlB);
});

updateCompatibilityHints();
listCameras();
drawAnalysis();
