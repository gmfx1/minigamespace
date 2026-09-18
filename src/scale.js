// Pure DOM API for the scale scene. No Firebase, no state — just render.
// Phase 3 will import these functions and drive them from shared state.

const SCENE_ID = 'scene';

// Coordinate system constants matching the viewBox in index.html.
const PIVOT_X = 500;
const PIVOT_Y = 200;
const ARM_LENGTH = 325;      // beam extends ±325 from pivot
// MAX_TILT is bounded by geometry: at this angle the descending tray bottom (world y
// = 600 + 325·sinθ) just reaches the plinth top near y=628. Enforced as a hard cap
// regardless of any config value so the trays never cross the fulcrum base.
const MAX_TILT_DEFAULT = 5;  // degrees

let sceneEl = null;
let sceneWrapEl = null;
let beamEl = null;
let trayLeftEl = null;
let trayRightEl = null;

export function initScene() {
  sceneEl = document.getElementById(SCENE_ID);
  if (!sceneEl) throw new Error(`#${SCENE_ID} not found`);
  sceneWrapEl = document.getElementById('scene-wrap');
  beamEl = sceneEl.querySelector('#beam');
  trayLeftEl = sceneEl.querySelector('#tray-left');
  trayRightEl = sceneEl.querySelector('#tray-right');
  setTilt(0);
}

// Rotate the beam and re-anchor the trays to the beam endpoints.
// Trays stay level because they translate rather than rotate.
export function setTilt(angleDeg, { maxTilt = MAX_TILT_DEFAULT } = {}) {
  const clamped = Math.max(-maxTilt, Math.min(maxTilt, angleDeg));
  const rad = (clamped * Math.PI) / 180;

  beamEl.style.transform = `rotate(${clamped}deg)`;

  const leftX = PIVOT_X - ARM_LENGTH * Math.cos(rad);
  const leftY = PIVOT_Y - ARM_LENGTH * Math.sin(rad);
  const rightX = PIVOT_X + ARM_LENGTH * Math.cos(rad);
  const rightY = PIVOT_Y + ARM_LENGTH * Math.sin(rad);

  trayLeftEl.setAttribute('transform', `translate(${leftX} ${leftY})`);
  trayRightEl.setAttribute('transform', `translate(${rightX} ${rightY})`);
}

export function setBackground(url) {
  if (!sceneWrapEl) return;
  sceneWrapEl.style.backgroundImage = url ? `url("${url.replace(/"/g, '\\"')}")` : '';
}

// Phase 4 will use this to know where to snap a dropped token.
export function getTrayCenter(side) {
  const el = side === 'left' ? trayLeftEl : trayRightEl;
  const m = el.transform.baseVal.consolidate();
  return m ? { x: m.matrix.e, y: m.matrix.f + 380 } : { x: 0, y: 0 };
}

// Convert (weight difference) → (tilt angle). Positive angle = left side rises,
// so the heavier side must produce a negative angle to visually descend.
export function tiltFromWeights(leftSum, rightSum, weightScale = 1.5) {
  return (rightSum - leftSum) * weightScale;
}
