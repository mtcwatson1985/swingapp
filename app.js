const state = {
  streamA: null,
  streamB: null,
  recorderA: null,
  recorderB: null,
  mediaBufferA: [],
  mediaBufferB: [],
  preRollA: [],
  preRollB: [],
  preRollTimer: null,
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
  savedAngles: []
};

const ui = {
  cameraA: document.getElementById('cameraA'),
  cameraB: document.getElementById('cameraB'),
  resolution: document.getElementById('resolution'),
  fpsTarget: document.getElementById('fpsTarget'),
  preRollSeconds: document.getElementById('preRollSeconds'),
  postRollSeconds: document.getElementById('postRollSeconds'),
  impactThreshold: document.getElementById('impactThreshold'),
  impactValue: document.getElementById('impactValue'),
  startMonitor: document.getElementById('startMonitor'),
  stopMonitor: document.getElementById('stopMonitor'),
  toggleImpact: document.getElementById('toggleImpact'),
  manualRecord: document.getElementById('manualRecord'),
  status: document.getElementById('status'),
  videoA: document.getElementById('videoA'),
  videoB: document.getElementById('videoB'),
  replayA: document.getElementById('replayA'),
  replayB: document.getElementById('replayB'),
  instantReplay: document.getElementById('instantReplay'),
  halfReplay: document.getElementById('halfReplay'),
  normalReplay: document.getElementById('normalReplay'),
  editorSource: document.getElementById('editorSource'),
  toolMode: document.getElementById('toolMode'),
  captureFrame: document.getElementById('captureFrame'),
  clearOverlays: document.getElementById('clearOverlays'),
  analysisCanvas: document.getElementById('analysisCanvas'),
  measurements: document.getElementById('measurements')
};

const ctx = ui.analysisCanvas.getContext('2d');

function setStatus(message) {
  ui.status.textContent = `Status: ${message}`;
}

function parseResolution() {
  const [width, height] = ui.resolution.value.split('x').map(Number);
  return { width, height };
}

async function listCameras() {
  try {
    const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    temp.getTracks().forEach((track) => track.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((device) => device.kind === 'videoinput');

    for (const select of [ui.cameraA, ui.cameraB]) {
      select.innerHTML = '';
      videos.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        select.appendChild(option);
      });
    }
    if (ui.cameraB.options.length > 1) {
      ui.cameraB.selectedIndex = 1;
    }
  } catch (error) {
    setStatus(`unable to enumerate cameras (${error.message})`);
  }
}

function chooseSupportedMime() {
  const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function setupPreRollSampling() {
  clearInterval(state.preRollTimer);
  state.preRollTimer = setInterval(async () => {
    if (!state.streamA || !state.streamB) return;

    const snapA = await snapshotStream(state.streamA, ui.videoA);
    const snapB = await snapshotStream(state.streamB, ui.videoB);

    if (snapA) state.preRollA.push(snapA);
    if (snapB) state.preRollB.push(snapB);

    const maxSamples = Number(ui.preRollSeconds.value) * 6;
    state.preRollA = state.preRollA.slice(-maxSamples);
    state.preRollB = state.preRollB.slice(-maxSamples);
  }, 160);
}

async function snapshotStream(stream, sourceVideo) {
  if (!stream || sourceVideo.readyState < 2) return null;
  const canvas = document.createElement('canvas');
  canvas.width = sourceVideo.videoWidth || 640;
  canvas.height = sourceVideo.videoHeight || 360;
  const context = canvas.getContext('2d');
  context.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}

async function startMonitoring() {
  const { width, height } = parseResolution();
  const fps = Number(ui.fpsTarget.value);

  const constraintsA = {
    video: {
      deviceId: ui.cameraA.value ? { exact: ui.cameraA.value } : undefined,
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: fps }
    },
    audio: false
  };

  const constraintsB = {
    video: {
      deviceId: ui.cameraB.value ? { exact: ui.cameraB.value } : undefined,
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: fps }
    },
    audio: false
  };

  try {
    state.streamA = await navigator.mediaDevices.getUserMedia(constraintsA);
    state.streamB = await navigator.mediaDevices.getUserMedia(constraintsB);

    ui.videoA.srcObject = state.streamA;
    ui.videoB.srcObject = state.streamB;

    setupPreRollSampling();

    ui.startMonitor.disabled = true;
    ui.stopMonitor.disabled = false;
    ui.toggleImpact.disabled = false;
    ui.manualRecord.disabled = false;
    ui.captureFrame.disabled = false;

    setStatus('dual monitor active (wireless, low-latency preview)');
  } catch (error) {
    setStatus(`failed to start monitor (${error.message})`);
  }
}

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

async function stopMonitoring() {
  stopStream(state.streamA);
  stopStream(state.streamB);
  state.streamA = null;
  state.streamB = null;
  ui.videoA.srcObject = null;
  ui.videoB.srcObject = null;

  await disableImpactTrigger();

  clearInterval(state.preRollTimer);
  state.preRollA = [];
  state.preRollB = [];

  ui.startMonitor.disabled = false;
  ui.stopMonitor.disabled = true;
  ui.toggleImpact.disabled = true;
  ui.manualRecord.disabled = true;
  ui.captureFrame.disabled = true;

  setStatus('monitor stopped');
}

function buildRecorder(stream, targetBuffer) {
  const mimeType = chooseSupportedMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) targetBuffer.push(event.data);
  };
  return recorder;
}

function bufferDataURLtoBlob(dataURL) {
  const [header, base64] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function recordShot(reason = 'manual trigger') {
  if (!state.streamA || !state.streamB || state.recorderA || state.recorderB) return;

  state.mediaBufferA = [];
  state.mediaBufferB = [];

  state.recorderA = buildRecorder(state.streamA, state.mediaBufferA);
  state.recorderB = buildRecorder(state.streamB, state.mediaBufferB);

  state.recorderA.start();
  state.recorderB.start();

  setStatus(`recording shot (${reason})`);

  const postRoll = Math.max(1, Number(ui.postRollSeconds.value));
  await new Promise((resolve) => setTimeout(resolve, postRoll * 1000));

  await Promise.all([
    new Promise((resolve) => {
      state.recorderA.onstop = resolve;
      state.recorderA.stop();
    }),
    new Promise((resolve) => {
      state.recorderB.onstop = resolve;
      state.recorderB.stop();
    })
  ]);

  const preRollBlobsA = state.preRollA.map(bufferDataURLtoBlob);
  const preRollBlobsB = state.preRollB.map(bufferDataURLtoBlob);

  const blobA = new Blob([...preRollBlobsA, ...state.mediaBufferA], { type: chooseSupportedMime() || 'video/webm' });
  const blobB = new Blob([...preRollBlobsB, ...state.mediaBufferB], { type: chooseSupportedMime() || 'video/webm' });

  ui.replayA.src = URL.createObjectURL(blobA);
  ui.replayB.src = URL.createObjectURL(blobB);

  ui.instantReplay.disabled = false;
  ui.halfReplay.disabled = false;
  ui.normalReplay.disabled = false;

  state.recorderA = null;
  state.recorderB = null;
  setStatus('shot captured and ready for replay');
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

      if (dbApprox > threshold() && !state.impactCooldown && !state.recorderA && !state.recorderB) {
        state.impactCooldown = true;
        recordShot('impact detected');
        setTimeout(() => {
          state.impactCooldown = false;
        }, 1800);
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

function drawAnalysis() {
  const canvas = ui.analysisCanvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.overlayImage) {
    ctx.drawImage(state.overlayImage, 0, 0, canvas.width, canvas.height);
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
    for (const point of state.tracePoints.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  if (state.lineDraft.length === 1) {
    drawPoint(state.lineDraft[0], '#2fd4b1');
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
  const cosTheta = dot / (magAB * magCB);
  const safe = Math.min(1, Math.max(-1, cosTheta));
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

ui.impactThreshold.addEventListener('input', () => {
  ui.impactValue.textContent = `${ui.impactThreshold.value} dB`;
});

ui.startMonitor.addEventListener('click', startMonitoring);
ui.stopMonitor.addEventListener('click', stopMonitoring);
ui.toggleImpact.addEventListener('click', toggleImpactTrigger);
ui.manualRecord.addEventListener('click', () => recordShot('manual trigger'));
ui.instantReplay.addEventListener('click', () => replayAtRate(0.25));
ui.halfReplay.addEventListener('click', () => replayAtRate(0.5));
ui.normalReplay.addEventListener('click', () => replayAtRate(1));
ui.captureFrame.addEventListener('click', captureReplayFrame);
ui.clearOverlays.addEventListener('click', clearOverlays);
ui.analysisCanvas.addEventListener('click', onCanvasClick);

window.addEventListener('beforeunload', () => {
  stopMonitoring();
});

listCameras();
drawAnalysis();
