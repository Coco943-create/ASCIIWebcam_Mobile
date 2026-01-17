let video;

// Containers
let asciiDiv;
let asciiContentDiv;
let promptDiv;
let startDiv;

// Characters
let chars = '@#W$%88B0MXYU+=|\\/*:;-,. ';

// Grid
let cols, rows;
let charW = 6;
let charH = 12;

// State
let started = false;        // camera running
let transitioning = false;  // ripple reveal running

// Start button typing
let startWord = 'BEGIN';
let startTyped = 0;
let startLastType = 0;
let typeInterval = 140;

let cursorOn = true;
let cursorLast = 0;
let cursorInterval = 450;

// Bottom prompt
let prompts = ['Are you still there?', 'Say something...', 'Please wait...'];
let currentPrompt = '';
let promptIndex = 0;
let typing = true;
let waiting = false;
let waitStart = 0;
let waitDuration = 2000;

// Waves
let waveOffset = 0;

// Ripple transition
let rippleActive = false;
let rippleStartAt = 0;
let rippleDuration = 900; // ms
let rippleCx = 0;
let rippleCy = 0;

function setup() {
  noCanvas();
  createASCIIDiv();
  createStartButton();
  updateGrid();
}

function draw() {
  updateGrid();

  if (!started) {
    // Always render waves; if rippleActive, distort them with a uniform radial ripple
    drawOrganicWavesWithRipple();
    animateStartButton();
    return;
  }

  // Camera view
  if (!video) return;
  if (!video.width || !video.height) return;

  video.loadPixels();

  // Use visual aspect ratio of ASCII cells to avoid “squash”
  const targetAspect = (cols * charW) / (rows * charH);
  const crop = getCoverCrop(video.width, video.height, targetAspect);

  let output = '';

  for (let y = 0; y < rows; y++) {
    const sy = Math.floor(crop.sy + (y / (rows - 1 || 1)) * (crop.sh - 1));

    for (let x = 0; x < cols; x++) {
      const sx = Math.floor(crop.sx + (x / (cols - 1 || 1)) * (crop.sw - 1));
      const i = (sx + sy * video.width) * 4;

      const r = video.pixels[i + 0];
      const g = video.pixels[i + 1];
      const b = video.pixels[i + 2];
      const avg = (r + g + b) / 3;

      const idx = Math.floor(map(avg, 0, 255, chars.length - 1, 0));
      const c = chars.charAt(idx);

      output += (c === ' ') ? '&nbsp;' : c;
    }
    output += '<br/>';
  }

  asciiContentDiv.html(output);
  handlePromptTyping();
}

// ---------- WAVES + RIPPLE ----------
function drawOrganicWavesWithRipple() {
  waveOffset += 0.02;

  const now = millis();
  let t = 0;
  if (rippleActive) {
    t = constrain((now - rippleStartAt) / rippleDuration, 0, 1);
    if (t >= 1) {
      rippleActive = false;
      // Reveal camera after ripple completes
      startCameraNow();
    }
  }

  // ripple radius grows from 0 to max diagonal
  const maxR = Math.sqrt(cols * cols + rows * rows);
  const rippleR = t * maxR;

  // Ripple “ring” thickness (in grid units)
  const ringWidth = 2.2;

  // Ripple strength (how much it distorts)
  const strength = 3.2 * (1 - t); // fades out as it expands

  let output = '';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Base domain warp for organic non-repeating feel
      const wx = (noise(x * 0.03, y * 0.03, waveOffset) - 0.5) * 6.0;
      const wy = (noise(x * 0.03, y * 0.03, waveOffset + 10.0) - 0.5) * 6.0;

      let xx = x + wx;
      let yy = y + wy;

      // Apply a uniform radial ripple distortion around the click point
      if (rippleActive) {
        const dx = x - rippleCx;
        const dy = y - rippleCy;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;

        // How close this cell is to the expanding ring
        const ringDist = Math.abs(d - rippleR);

        // A smooth pulse at the ring: 1 at ring centre, 0 away from it
        const pulse = smoothstep(ringWidth, 0, ringDist);

        // Direction away from click centre
        const nx = dx / d;
        const ny = dy / d;

        // Offset cells outward as the ring passes (water drop feel)
        xx += nx * pulse * strength;
        yy += ny * pulse * strength;
      }

      const n1 = noise(xx * 0.06, yy * 0.06, waveOffset);
      const n2 = noise(xx * 0.14, yy * 0.14, waveOffset * 1.6);
      const n3 = noise(xx * 0.22, yy * 0.22, waveOffset * 2.1);

      let n = (n1 * 0.62) + (n2 * 0.28) + (n3 * 0.10);

      const idx = Math.floor(map(n, 0, 1, 0, chars.length - 1));
      const c = chars.charAt(idx);

      output += (c === ' ') ? '&nbsp;' : c;
    }
    output += '<br/>';
  }

  asciiContentDiv.html(output);
}

function smoothstep(edge0, edge1, x) {
  // Smoothly interpolate from 0 to 1 as x goes from edge0 to edge1
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------- CAMERA (no distortion) ----------
function getCoverCrop(srcW, srcH, targetAspect) {
  const srcAspect = srcW / srcH;

  let sx = 0, sy = 0, sw = srcW, sh = srcH;

  if (targetAspect > srcAspect) {
    sw = srcW;
    sh = Math.floor(srcW / targetAspect);
    sy = Math.floor((srcH - sh) / 2);
  } else {
    sh = srcH;
    sw = Math.floor(srcH * targetAspect);
    sx = Math.floor((srcW - sw) / 2);
  }

  sx = Math.max(0, Math.min(sx, srcW - 1));
  sy = Math.max(0, Math.min(sy, srcH - 1));
  sw = Math.max(1, Math.min(sw, srcW - sx));
  sh = Math.max(1, Math.min(sh, srcH - sy));

  return { sx, sy, sw, sh };
}

function setupVideo() {
  if (video) video.remove();

  video = createCapture(
    {
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    },
    () => {}
  );

  video.hide();
}

function startCameraNow() {
  if (started) return;
  started = true;

  // remove button when camera begins
  if (startDiv) startDiv.remove();

  setupVideo();
  pickNewPrompt();
}

// ---------- START BUTTON ----------
function createStartButton() {
  startDiv = createDiv('');
  startDiv.parent(asciiDiv);

  startDiv.style('position', 'absolute');
  startDiv.style('top', '50%');
  startDiv.style('left', '50%');
  startDiv.style('transform', 'translate(-50%, -50%)');
  startDiv.style('padding', '30px 44px');
  startDiv.style('border', '1px solid white');
  startDiv.style('background', 'rgba(0,0,139,0.85)');
  startDiv.style('color', 'white');
  startDiv.style('font-family', 'monospace');
  startDiv.style('font-size', '42px');
  startDiv.style('line-height', '42px');
  startDiv.style('cursor', 'pointer');
  startDiv.style('user-select', 'none');

  // Click triggers ripple (camera starts when ripple completes)
  startDiv.mousePressed(() => triggerRippleAtCentre());
}

function animateStartButton() {
  const now = millis();

  if (startTyped < startWord.length && now - startLastType > typeInterval) {
    startLastType = now;
    startTyped++;
  }

  if (now - cursorLast > cursorInterval) {
    cursorLast = now;
    cursorOn = !cursorOn;
  }

  const text = startWord.substring(0, startTyped);
  const cursor = cursorOn ? '|' : '&nbsp;';
  startDiv.html('/' + text + cursor);
}

// Trigger a uniform ripple from where the user clicked.
// We use the click location relative to the screen, mapped into the ASCII grid.
function triggerRippleAtCentre() {
  if (rippleActive || started) return;

  // If the user clicks the button, use their click position as the ripple origin.
  // If we can’t read mouseX/mouseY cleanly, fall back to centre.
  const mx = (typeof mouseX === 'number') ? mouseX : windowWidth * 0.5;
  const my = (typeof mouseY === 'number') ? mouseY : windowHeight * 0.5;

  rippleCx = constrain(Math.floor(map(mx, 0, windowWidth, 0, cols - 1)), 0, cols - 1);
  rippleCy = constrain(Math.floor(map(my, 0, windowHeight, 0, rows - 1)), 0, rows - 1);

  rippleStartAt = millis();
  rippleActive = true;
}

// ---------- PROMPT ----------
function handlePromptTyping() {
  if (waiting) {
    if (millis() - waitStart > waitDuration) {
      waiting = false;
      typing = !typing;
      if (typing) pickNewPrompt();
    }
    return;
  }

  if (typing) {
    if (promptIndex < currentPrompt.length) {
      promptIndex++;
      promptDiv.html('/' + currentPrompt.substring(0, promptIndex));
    } else {
      waiting = true;
      waitStart = millis();
    }
  } else {
    if (promptIndex > 0) {
      promptIndex--;
      promptDiv.html('/' + currentPrompt.substring(0, promptIndex));
    } else {
      waiting = true;
      waitStart = millis();
    }
  }
}

function pickNewPrompt() {
  currentPrompt = random(prompts);
  promptIndex = 0;
}

// ---------- LAYOUT ----------
function createASCIIDiv() {
  asciiDiv = createDiv();
  asciiDiv.style('position', 'absolute');
  asciiDiv.style('top', '0');
  asciiDiv.style('left', '0');
  asciiDiv.style('width', '100%');
  asciiDiv.style('height', '100%');
  asciiDiv.style('margin', '0');
  asciiDiv.style('padding', '0');
  asciiDiv.style('background', 'rgb(0,0,139)');
  asciiDiv.style('font-family', 'monospace');
  asciiDiv.style('font-size', charH + 'px');
  asciiDiv.style('line-height', charH + 'px');
  asciiDiv.style('color', 'white');
  asciiDiv.style('white-space', 'pre');
  asciiDiv.style('overflow', 'hidden');

  asciiContentDiv = createDiv();
  asciiContentDiv.parent(asciiDiv);

  promptDiv = createDiv('/');
  promptDiv.parent(asciiDiv);
  promptDiv.style('position', 'absolute');
  promptDiv.style('bottom', '20px');
  promptDiv.style('left', '20px');
  promptDiv.style('padding', '6px 10px');
  promptDiv.style('border', '1px solid white');
  promptDiv.style('background', 'rgba(0,0,139,0.85)');
  promptDiv.style('font-family', 'monospace');
  promptDiv.style('font-size', '16px');
  promptDiv.style('line-height', '16px');
}

function updateGrid() {
  cols = Math.max(10, Math.floor(windowWidth / charW));
  rows = Math.max(10, Math.floor(windowHeight / charH));
}

function windowResized() {
  updateGrid();
}
