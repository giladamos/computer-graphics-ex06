import { OrbitControls } from './OrbitControls.js';

// Load court texture
const textureLoader = new THREE.TextureLoader();
const woodTexture = textureLoader.load('src/textures/court_texture.jpeg');
woodTexture.wrapS = THREE.ClampToEdgeWrapping;
woodTexture.wrapT = THREE.ClampToEdgeWrapping;
woodTexture.repeat.set(1, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

scene.background = new THREE.Color(0x000000);

scene.add(new THREE.AmbientLight(0xffffff, 0.50));
const sun = new THREE.DirectionalLight(0xffffff, 0.80);
sun.position.set(10, 20, 15);
sun.castShadow = true;
scene.add(sun);

sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;
const shadowRange = 30;
sun.shadow.camera.left = -shadowRange;
sun.shadow.camera.right = shadowRange;
sun.shadow.camera.top = shadowRange;
sun.shadow.camera.bottom = -shadowRange;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;

const COURT_LEN = 30;
const COURT_WID = 15;
const COURT_THICK = 0.2;
const LINE_Y = COURT_THICK * 0.55;
const RIM_H = 3.05;
const BACK_W = 1.8;
const BACK_H = 1.05;
const BACK_T = 0.05;
const RIM_RAD = 0.45;
const RIM_TUBE = 0.03;
const RIM_TO_BASE = RIM_TUBE + BACK_T / 2 + 0.4;
const HALF_LEN = COURT_LEN / 2;
const BALL_RAD = 0.132;
const FLOOR_Y = COURT_THICK / 2;

// Basketball movement and physics variables
let basketball;
let ballVelocity = new THREE.Vector3(0, 0, 0);
let ballPosition = new THREE.Vector3(0, FLOOR_Y + BALL_RAD, 0);
let isBallMoving = false;
let isBallInFlight = false;
const MOVEMENT_SPEED = 0.30;
const COURT_BOUNDS = {
  minX: -HALF_LEN + BALL_RAD,
  maxX: HALF_LEN - BALL_RAD,
  minZ: -COURT_WID/2 + BALL_RAD,
  maxZ: COURT_WID/2 - BALL_RAD
};

// Shot power system
let shotPower = 50;
const POWER_CHANGE_RATE = 5;
const MIN_POWER = 0;
const MAX_POWER = 100;

// Physics system
const GRAVITY = -9.8;
const TIME_STEP = 1/60;
let physicsTime = 0;
let lastTime = 0;

// Collision detection
let hoopLeft, hoopRight;
const BACKBOARD_WIDTH = BACK_W;
const BACKBOARD_HEIGHT = BACK_H;
const BACKBOARD_THICKNESS = BACK_T;
const RIM_RADIUS = RIM_RAD;
const RIM_HEIGHT = RIM_H;

// Out of bounds detection
let outOfBoundsTimer = 0;
const OUT_OF_BOUNDS_DELAY = 1.5;
let isOutOfBounds = false;
let lastShotTarget = 'left';
let weakShotTimer = 0;
const WEAK_SHOT_DELAY = 3.0;

// Ball rotation animation
let ballRotationAxis = new THREE.Vector3(0, 1, 0);
let ballRotationSpeed = 0;
const ROTATION_SPEED_MULTIPLIER = 2.0;

// Scoring system
let totalScore = 0;
let shotAttempts = 0;
let shotsMade = 0;
let shootingPercentage = 0;
let lastShotTime = 0;
const SCORE_DELAY = 0.5;
let lastShotPosition = new THREE.Vector3();
let shotDetected = false;
let shotResultDetermined = false;
let nextShotDelay = 0;
const NEXT_SHOT_DELAY = 3.0;

// Swish detection
let swishShots = 0;
let rimTouched = false;
let lastShotWasSwish = false;

// Combo system
let currentCombo = 0;
let maxCombo = 0;
let comboMultiplier = 1;
const COMBO_THRESHOLDS = [3, 5, 8, 12];

// Ball trail effect
let ballTrail = [];
const TRAIL_LENGTH = 15;
const TRAIL_FADE_TIME = 0.5;

// Sound effects
let audioContext;
let sounds = {};
const SOUND_VOLUME = 0.3;

// Game modes
let currentGameMode = 'free';
let gameTime = 60;
let timeRemaining = gameTime;
let gameActive = false;
let gameStartTime = 0;

// Real game mode
let currentQuarter = 1;
let quarterTime = 120;
let quarterTimeRemaining = quarterTime;
let homeScore = 0;
let awayScore = 0;
let isRealGameActive = false;

function buildCourtFloor() {
  // a single top-side plane, UVs run 0→1 across the whole thing
  const geo = new THREE.PlaneGeometry(COURT_LEN, COURT_WID);
  geo.rotateX(-Math.PI / 2);  // make it horizontal
  const mat = new THREE.MeshPhongMaterial({
    map: woodTexture,
    shininess: 50
  });
  const floor = new THREE.Mesh(geo, mat);
  floor.receiveShadow = true;
  scene.add(floor);
}

function buildCenterLine() {
  const pts = [
    new THREE.Vector3(0, LINE_Y, -COURT_WID / 2),
    new THREE.Vector3(0, LINE_Y, COURT_WID / 2),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, paint()));
}

function buildCenterCircle() {
  const radius = 1.8;
  const segs = 64;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(t) * radius, LINE_Y, Math.sin(t) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, paint()));
}

function buildThreePointArcs() {
  const radius = 6.75;
  const segs = 64;
  const θmax = Math.acos(0 / radius);
  [+HALF_LEN, -HALF_LEN].forEach(centerX => {
    const dir = centerX > 0 ? -1 : 1;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const θ = -θmax + (i / segs) * 2 * θmax;
      pts.push(new THREE.Vector3(
        centerX + dir * Math.cos(θ) * radius,
        LINE_Y,
        Math.sin(θ) * radius
      ));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), paint()));
  });
}

function buildKeyMarkings() {
  // ─── Dimensions ────────────────────────────────────────────
  const keyWidth = 3.6;                   // paint is 3.6m wide
  const keyDepth = 4.4;                   // FT line at 4.0m from baseline
  const ftRadius = 1.8 - 0.1;             // 1.7m free-throw arc radius
  const restrictRadius = 1.25;           // restricted area radius
  const tickZs         = [-1.75, 0, 1.75]; // Z positions for 3 block marks
  const tickLen        = 0.3;            // length of each tick (along X)
  const segs           = 32;             // smoothness
  const mat            = paint();        // your line material

  // ─── Court constants ───────────────────────────────────────
  const halfX    = COURT_LEN / 2;               // baseline X
  const rimInset = RIM_TO_BASE + 0.05;          // rim offset from baseline

  [ -halfX, halfX ].forEach(baselineX => {
    // dir = +1 on left (to draw into court), –1 on right
    const dir = baselineX < 0 ?  1 : -1;
    const ftX = baselineX + dir * keyDepth;     // X of free‐throw line

    // A) Paint rectangle
    const rectPts = [
      new THREE.Vector3(baselineX, LINE_Y, -keyWidth/2),
      new THREE.Vector3(baselineX, LINE_Y,  keyWidth/2),
      new THREE.Vector3(ftX,       LINE_Y,  keyWidth/2),
      new THREE.Vector3(ftX,       LINE_Y, -keyWidth/2),
      new THREE.Vector3(baselineX, LINE_Y, -keyWidth/2)
    ];
    scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(rectPts),
        mat
    ));

    // B) Free-throw line
    scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ftX, LINE_Y, -keyWidth/2),
          new THREE.Vector3(ftX, LINE_Y,  keyWidth/2)
        ]),
        mat
    ));

    // C) Free-throw semicircle (–90°→+90° into paint)
    const ftArcPts = [];
    const threeR  = 6.75;
    const margin  = 0.1;

    for (let i = 0; i <= segs; i++) {
      const θ = -Math.PI/2 + (i / segs) * Math.PI;
      const localX = ftX + dir * ftRadius * Math.cos(θ);
      const localZ =         ftRadius * Math.sin(θ);

      // distance inward from the baseline to this ft‐arc point
      const distIn = Math.abs(baselineX - localX);

      // maximum allowed inward distance at this Z
      const maxDist = Math.sqrt(Math.max(0, threeR*threeR - localZ*localZ)) - margin;

      if (distIn <= maxDist) {
        ftArcPts.push(new THREE.Vector3(localX, LINE_Y, localZ));
      }
    }

    scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ftArcPts),
        mat
    ));

    // ── NEW SIDE-RAIL BLOCK MARKS ───────────────────
    // X-offsets from the baseline (in meters) where the 3 “block” ticks go:
    const blockOffsets = [ 1.75, 3.00, 4.25 ];
    const railZ        = keyWidth / 2;  // side rails at ±half width
    const tickLen      = 0.3;           // how far each tick sticks into the paint

    blockOffsets.forEach(offset => {
      // compute X on each side
      const xPos = baselineX + dir * offset;

      // draw one tick on the left rail, one on the right
      [  railZ, -railZ ].forEach(z => {
        const start = new THREE.Vector3(xPos, LINE_Y, z);
        const end   = new THREE.Vector3(xPos, LINE_Y, z + dir * tickLen);
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([start, end]),
            paint()
        ));
      });
    });
    // ────────────────────────────────────────────────

    // E) Restricted-area arc under the rim
    const rimX     = baselineX + dir * rimInset;
    const restrict = [];
    for (let i = 0; i <= segs; i++) {
      const θ = -Math.PI/2 + (i / segs) * Math.PI;
      const x = rimX + dir * restrictRadius * Math.cos(θ);
      const z =                     restrictRadius * Math.sin(θ);
      restrict.push(new THREE.Vector3(x, LINE_Y, z));
    }
    scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(restrict),
        mat
    ));
  });
}

function paint() {
  return new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
}

function makeHoop() {
  const hoop = new THREE.Group();

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BACK_W, BACK_H, BACK_T),
    new THREE.MeshPhongMaterial({ 
      color: 0xffffff,
      transparent: true, 
      opacity: 0.3,
      side: THREE.DoubleSide
    })
  );
  board.rotation.y = -Math.PI / 2;
  board.position.set(-RIM_TO_BASE, RIM_H + BACK_H / 2, 0);
  hoop.add(board);

  const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const frameThickness = 0.05;
  const frameDepth = BACK_T + 0.02;

  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, frameThickness, BACK_W),
    frameMaterial
  );
  topFrame.position.set(-RIM_TO_BASE, RIM_H + BACK_H - frameThickness / 2, 0);
  hoop.add(topFrame);

  const bottomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, frameThickness, BACK_W),
    frameMaterial
  );
  bottomFrame.position.set(-RIM_TO_BASE, RIM_H + frameThickness / 2, 0);
  hoop.add(bottomFrame);

  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, BACK_H - (2 * frameThickness), frameThickness),
    frameMaterial
  );
  leftFrame.position.set(-RIM_TO_BASE, RIM_H + BACK_H / 2, -BACK_W / 2 + frameThickness / 2);
  hoop.add(leftFrame);

  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, BACK_H - (2 * frameThickness), frameThickness),
    frameMaterial
  );
  rightFrame.position.set(-RIM_TO_BASE, RIM_H + BACK_H / 2, BACK_W / 2 - frameThickness / 2);
  hoop.add(rightFrame);

  const squareSize = 0.6;
  const squarePoints = [
    new THREE.Vector3(-squareSize/2, squareSize/2, 0),
    new THREE.Vector3(squareSize/2, squareSize/2, 0),
    new THREE.Vector3(squareSize/2, -squareSize/2, 0),
    new THREE.Vector3(-squareSize/2, -squareSize/2, 0),
    new THREE.Vector3(-squareSize/2, squareSize/2, 0)
  ];
  
  const squareGeo = new THREE.BufferGeometry().setFromPoints(squarePoints);
  const targetSquare = new THREE.Line(
    squareGeo, 
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 })
  );
  
  targetSquare.rotation.y = -Math.PI / 2;
  targetSquare.position.set(-RIM_TO_BASE + BACK_T/2 + 0.01, RIM_H + 0.25, 0);
  hoop.add(targetSquare);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_RAD, RIM_TUBE, 16, 100),
    new THREE.MeshPhongMaterial({ color: 0xff8c00 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, RIM_H, 0);
  hoop.add(rim);

  const netDepth = 0.75;
  const segments = 19;
  const netMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const netGroup = new THREE.Group();

  for (let i = 0; i < segments; i++) {
    const θ = (i / segments) * 2 * Math.PI;
    const x = Math.cos(θ) * RIM_RAD;
    const z = Math.sin(θ) * RIM_RAD;

    const strandPoints = [];
    const numPoints = 6;

    for (let j = 0; j <= numPoints; j++) {
      const t = j / numPoints;
      const y = RIM_H - (netDepth * t);
      const tapeFactor = 1 - (0.3 * t);

      strandPoints.push(new THREE.Vector3(
        x * tapeFactor,
        y,
        z * tapeFactor
      ));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(strandPoints);
    netGroup.add(new THREE.Line(geo, netMat));
  }

  const numRings = 7;
  for (let ring = 1; ring <= numRings; ring++) {
    const t = ring / (numRings + 1);
    const y = RIM_H - (netDepth * t);
    const tapeFactor = 1 - (0.3 * t);
    const ringRadius = RIM_RAD * tapeFactor;

    const ringPoints = [];
    for (let i = 0; i <= segments; i++) {
      const θ = (i / segments) * 2 * Math.PI;
      ringPoints.push(new THREE.Vector3(
        Math.cos(θ) * ringRadius,
        y,
        Math.sin(θ) * ringRadius
      ));
    }

    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    netGroup.add(new THREE.Line(ringGeo, netMat));
  }

  hoop.add(netGroup);

  const topPoleHeight = RIM_H + BACK_H + 0.1;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, topPoleHeight, 16),
    new THREE.MeshPhongMaterial({ color: 0x333333 })
  );
  pole.position.set(-(RIM_TO_BASE + BACK_T / 2 + 1.5), topPoleHeight / 2, 0);
  hoop.add(pole);

  const mainArmLen = 1.5;
  const mainArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, mainArmLen, 8),
    pole.material
  );
  mainArm.rotation.z = Math.PI / 2;
  mainArm.position.set(-(RIM_TO_BASE + BACK_T / 2 + 1.5) + mainArmLen / 2, RIM_H + BACK_H / 2, 0);
  hoop.add(mainArm);

  const upperConnectorLen = 1.5;
  const upperConnector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, upperConnectorLen, 8),
    pole.material
  );
  upperConnector.rotation.z = Math.PI / 2;
  upperConnector.position.set(
    -(RIM_TO_BASE + BACK_T / 2 + 1.5) + upperConnectorLen / 2, 
    RIM_H + BACK_H - 0.1,
    0
  );
  hoop.add(upperConnector);

  const lowerConnectorLen = 1.5;
  const lowerConnector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, lowerConnectorLen, 8),
    pole.material
  );
  lowerConnector.rotation.z = Math.PI / 2;
  lowerConnector.position.set(
    -(RIM_TO_BASE + BACK_T / 2 + 1.5) + lowerConnectorLen / 2, 
    RIM_H + 0.1,
    0
  );
  hoop.add(lowerConnector);

  const poleConnectorHeight = BACK_H - 0.2;
  const poleConnector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, poleConnectorHeight, 8),
    pole.material
  );
  poleConnector.position.set(
    -(RIM_TO_BASE + BACK_T / 2 + 1.5), 
    RIM_H + BACK_H / 2,
    0
  );
  hoop.add(poleConnector);

  const mountingPostHeight = BACK_H;
  const mountingPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, mountingPostHeight, 8),
    pole.material
  );
  mountingPost.position.set(
    -(RIM_TO_BASE + BACK_T / 2) - 0.03,
    RIM_H + BACK_H / 2,
    0
  );
  hoop.add(mountingPost);

  const upperBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.04),
    pole.material
  );
  upperBracket.position.set(
    -(RIM_TO_BASE + BACK_T / 2) + 0.01,
    RIM_H + BACK_H - 0.1,
    0
  );
  hoop.add(upperBracket);

  const lowerBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.04),
    pole.material
  );
  lowerBracket.position.set(
    -(RIM_TO_BASE + BACK_T / 2) + 0.01,
    RIM_H + 0.1,
    0
  );
  hoop.add(lowerBracket);

  const centralBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.08, 0.04),
    pole.material
  );
  centralBracket.position.set(
    -(RIM_TO_BASE + BACK_T / 2) + 0.01,
    RIM_H + BACK_H / 2,
    0
  );
  hoop.add(centralBracket);

  hoop.traverse(child => {
    if (child.isMesh) {
      if (child === board) {
        child.castShadow = false;
      } else {
        child.castShadow = true;
      }
      child.receiveShadow = true;
    }
  });

  return hoop;
}

function buildBasketball() {
  const ball = new THREE.Group();
  const seamRadius = BALL_RAD + 0.004;

  const coreGeometry = new THREE.SphereGeometry(BALL_RAD, 32, 32);
  const coreMaterial = new THREE.MeshPhongMaterial({
    color: 0xbf6015,
    shininess: 5,
  });
  const coreSphere = new THREE.Mesh(coreGeometry, coreMaterial);
  ball.add(coreSphere);

  const dotsGroup = new THREE.Group();
  const dotGeometry = new THREE.SphereGeometry(0.004, 4, 4);
  const dotMaterial = new THREE.MeshPhongMaterial({
    color: 0xc05a0a,
    shininess: 10,
  });

  const dotCount = 15000;
  for (let i = 0; i < dotCount; i++) {
    const y = 1 - (i / (dotCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = (i * 2.3999632297) % (Math.PI * 2);
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, y, z).multiplyScalar(BALL_RAD + 0.002);
    dotsGroup.add(dot);
  }
  ball.add(dotsGroup);

  const seamMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x000000,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });

  const baseNormal = new THREE.Vector3(1, 0, 0);
  const targetNormals = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4)),
    new THREE.Vector3(Math.cos(-Math.PI / 4), 0, Math.sin(-Math.PI / 4))
  ];

  const numPoints = 64;
  const basePoints = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 2;
    basePoints.push(
      new THREE.Vector3(0, Math.cos(t), Math.sin(t)).multiplyScalar(seamRadius)
    );
  }

  const seamGroup = new THREE.Group();

  targetNormals.forEach(targetNormal => {
    const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(baseNormal, targetNormal);
    const rotatedPoints = basePoints.map(p => p.clone().applyQuaternion(rotationQuaternion));
    const rotatedPath = new THREE.CatmullRomCurve3(rotatedPoints);
    const tubeGeo = new THREE.TubeGeometry(rotatedPath, 64, 0.003, 8, true);
    const seamTube = new THREE.Mesh(tubeGeo, seamMaterial);
    seamGroup.add(seamTube);
  });

  ball.add(seamGroup);

  ball.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  ball.position.set(0, FLOOR_Y + BALL_RAD, 0);
  scene.add(ball);
  
  // Store reference to basketball for movement
  basketball = ball;
  ballPosition.copy(ball.position);
}

function buildCourt() {
  buildCourtFloor();
  buildCenterLine();
  buildCenterCircle();
  buildThreePointArcs();
  buildKeyMarkings()
  buildBasketball();

  const rimInset = RIM_TO_BASE + 0.05;
  hoopLeft = makeHoop();
  hoopLeft.position.set(-HALF_LEN + rimInset, 0, 0);
  scene.add(hoopLeft);

  hoopRight = makeHoop();
  hoopRight.position.set(HALF_LEN - rimInset, 0, 0);
  hoopRight.rotation.y = Math.PI;
  scene.add(hoopRight);
}

let jumbotron; // global holder

function buildJumbotron() {
  // 1) off-screen square canvas for our four faces
  const size   = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx    = canvas.getContext('2d');

  // helper to paint your HTML scoreboard into canvas
  function redraw() {
    // clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // grab your UI values
    const sb = document.getElementById('scoreboard');
    const [homeScore, awayScore] = [...sb.querySelectorAll('.score')].map(el=>el.textContent);
    const period = sb.querySelector('.period').textContent;
    const time   = sb.querySelector('.time').textContent;

    // Draw background panels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(50, 50, size - 100, 120);
    ctx.fillRect(50, size - 170, size - 100, 120);
    ctx.fillRect(50, size/2 - 60, size - 100, 120);

    // Draw borders
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, size - 100, 120);
    ctx.strokeRect(50, size - 170, size - 100, 120);
    ctx.strokeRect(50, size/2 - 60, size - 100, 120);

    // Draw team names with glow effect
    ctx.shadowColor = '#ff6b35';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ff6b35';
    ctx.font = 'bold 32px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOME TEAM', size/2, 85);
    ctx.fillText('AWAY TEAM', size/2, size - 135);

    // Draw scores with glow effect
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 48px Orbitron, sans-serif';
    ctx.fillText(homeScore, size/2, 125);
    ctx.fillText(awayScore, size/2, size - 95);

    // Draw period and time
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px Orbitron, sans-serif';
    ctx.fillText(period, size/2, size/2 - 20);
    ctx.fillText(time, size/2, size/2 + 20);

    // Draw decorative elements
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(size/2 - 40, 30, 80, 4);
    ctx.fillRect(size/2 - 40, size - 34, 80, 4);
    ctx.fillRect(size/2 - 40, size/2 - 2, 80, 4);

    // Add some particle effects
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(0, 212, 255, ${Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  }

  // initial draw
  redraw();

  // 2) make a CanvasTexture
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // 3) box geometry, with 6 materials—only the 4 vertical faces get our texture
  const geo = new THREE.BoxGeometry(6, 3, 6);
  const mats = [
    new THREE.MeshBasicMaterial({ map: texture }), // +X
    new THREE.MeshBasicMaterial({ map: texture }), // -X
    new THREE.MeshBasicMaterial({ visible: false }),// +Y (top)
    new THREE.MeshBasicMaterial({ visible: false }),// -Y (bottom)
    new THREE.MeshBasicMaterial({ map: texture }), // +Z
    new THREE.MeshBasicMaterial({ map: texture })  // -Z
  ];

  // 4) put it in the scene, floating above center court
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(0, 12, 0);
  
  // Make the jumbotron static and non-interactive
  mesh.userData = { isStatic: true };
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  
  // Add subtle rotation animation
  mesh.userData.rotationSpeed = 0.001;
  
  scene.add(mesh);

  return { mesh, texture, redraw };
}

function buildBleachers() {
  const rows        = 8;
  const seatsPerRow = 32;
  const seatW       = COURT_LEN / seatsPerRow;
  const seatH       = 0.25;
  const seatD       = 0.8;
  const startZ      = COURT_WID/2 + 1.5; // 1.5m off court

  // Blue and yellow stadium materials
  const matBlue = new THREE.MeshPhongMaterial({ 
    color: 0x3498db, 
    shininess: 30,
    specular: 0x111111
  });
  const matYellow = new THREE.MeshPhongMaterial({ 
    color: 0xf1c40f, 
    shininess: 30,
    specular: 0x111111
  });

  // Create seat backrest material
  const matBackrest = new THREE.MeshPhongMaterial({ 
    color: 0x2c3e50, 
    shininess: 20,
    specular: 0x0a0a0a
  });

  for (let side of [ 1, -1 ]) {          // 1 → back, -1 → front
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < seatsPerRow; i++) {
        // Choose material based on position for blue/yellow pattern
        const mat = ((r + i) % 2 === 0) ? matBlue : matYellow;

        // Create seat cushion
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(seatW * 0.85, seatH, seatD * 0.9),
            mat
        );
        seat.position.set(
            -COURT_LEN/2 + seatW/2 + i * seatW,
            seatH/2 + r * seatH * 1.2,
            side * (startZ + r * (seatD * 0.7))
        );
        scene.add(seat);

        // Create seat backrest
        const backrest = new THREE.Mesh(
            new THREE.BoxGeometry(seatW * 0.85, seatH * 1.5, seatD * 0.1),
            matBackrest
        );
        backrest.position.set(
            -COURT_LEN/2 + seatW/2 + i * seatW,
            seatH * 1.35 + r * seatH * 1.2,
            side * (startZ + r * (seatD * 0.7) - seatD * 0.45)
        );
        scene.add(backrest);

        // Add subtle armrests for premium look
        if (i % 4 === 0) {
          const armrest = new THREE.Mesh(
              new THREE.BoxGeometry(seatW * 0.1, seatH * 0.8, seatD * 0.6),
              matBackrest
          );
          armrest.position.set(
              -COURT_LEN/2 + seatW/2 + i * seatW + seatW * 0.475,
              seatH * 0.9 + r * seatH * 1.2,
              side * (startZ + r * (seatD * 0.7))
          );
          scene.add(armrest);
        }
      }
    }
  }

  // Add stadium railings
  const railingMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x95a5a6, 
    shininess: 50,
    specular: 0x222222
  });

  for (let side of [ 1, -1 ]) {
    for (let r = 0; r < rows; r += 2) {
      const railing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, COURT_LEN * 0.8, 8),
          railingMaterial
      );
      railing.position.set(
          0,
          seatH * 1.5 + r * seatH * 1.2,
          side * (startZ + r * (seatD * 0.7))
      );
      railing.rotation.z = Math.PI / 2;
      scene.add(railing);
    }
  }

  // Add seats behind the baskets (end zones)
  const endZoneRows = 6;
  const endZoneSeatsPerRow = 12;
  const endZoneSeatW = 1.2;
  const endZoneStartX = HALF_LEN + 2; // 2m behind the baseline

  for (let end of [ 1, -1 ]) { // 1 = right end, -1 = left end
    for (let r = 0; r < endZoneRows; r++) {
      for (let i = 0; i < endZoneSeatsPerRow; i++) {
        // Choose material based on position for blue/yellow pattern
        const mat = ((r + i) % 2 === 0) ? matBlue : matYellow;

        // Create seat cushion
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(endZoneSeatW * 0.85, seatH, seatD * 0.9),
            mat
        );
        seat.position.set(
            end * (endZoneStartX + r * (seatD * 0.7)),
            seatH/2 + r * seatH * 1.2,
            -COURT_WID/2 + (i + 1) * (COURT_WID / (endZoneSeatsPerRow + 1))
        );
        scene.add(seat);

        // Create seat backrest
        const backrest = new THREE.Mesh(
            new THREE.BoxGeometry(endZoneSeatW * 0.85, seatH * 1.5, seatD * 0.1),
            matBackrest
        );
        backrest.position.set(
            end * (endZoneStartX + r * (seatD * 0.7)),
            seatH * 1.35 + r * seatH * 1.2,
            -COURT_WID/2 + (i + 1) * (COURT_WID / (endZoneSeatsPerRow + 1))
        );
        scene.add(backrest);

        // Add armrests for end zone seats
        if (i % 3 === 0) {
          const armrest = new THREE.Mesh(
              new THREE.BoxGeometry(endZoneSeatW * 0.1, seatH * 0.8, seatD * 0.6),
              matBackrest
          );
          armrest.position.set(
              end * (endZoneStartX + r * (seatD * 0.7) + endZoneSeatW * 0.475),
              seatH * 0.9 + r * seatH * 1.2,
              -COURT_WID/2 + (i + 1) * (COURT_WID / (endZoneSeatsPerRow + 1))
          );
          scene.add(armrest);
        }
      }
    }

    // Add railings for end zone seats
    for (let r = 0; r < endZoneRows; r += 2) {
      const railing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, COURT_WID * 0.8, 8),
          railingMaterial
      );
      railing.position.set(
          end * (endZoneStartX + r * (seatD * 0.7)),
          seatH * 1.5 + r * seatH * 1.2,
          0
      );
      railing.rotation.x = Math.PI / 2;
      scene.add(railing);
    }
  }
}


buildCourt();
jumbotron = buildJumbotron();
buildBleachers();


camera.position.set(20, 15, 25);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1;
controls.maxDistance = 100;
controls.zoomSpeed = 1.0;
controls.rotateSpeed = 0.5;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.1;
controls.enablePan = true;
controls.panSpeed = 1.0;
controls.keyPanSpeed = 7.0;
controls.screenSpacePanning = false;

controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN
};

let orbitEnabled = true;
let autoCameraEnabled = true;

// Basketball movement
function moveBall(direction) {
  if (isBallInFlight) return;
  
  const movement = new THREE.Vector3();
  
  switch(direction) {
    case 'left':
      movement.x = -MOVEMENT_SPEED;
      break;
    case 'right':
      movement.x = MOVEMENT_SPEED;
      break;
    case 'forward':
      movement.z = -MOVEMENT_SPEED;
      break;
    case 'backward':
      movement.z = MOVEMENT_SPEED;
      break;
  }
  
  // Apply movement
  ballPosition.add(movement);
  
  ballVelocity.copy(movement);
  
  // Boundary checking
  ballPosition.x = Math.max(COURT_BOUNDS.minX, Math.min(COURT_BOUNDS.maxX, ballPosition.x));
  ballPosition.z = Math.max(COURT_BOUNDS.minZ, Math.min(COURT_BOUNDS.maxZ, ballPosition.z));
  
  basketball.position.copy(ballPosition);
  isBallMoving = true;
  
  // Auto-camera tracking
  if (autoCameraEnabled) {
    controls.target.copy(ballPosition);
    controls.update();
  }
}

function resetBall() {
  ballPosition.set(0, FLOOR_Y + BALL_RAD, 0);
  ballVelocity.set(0, 0, 0);
  basketball.position.copy(ballPosition);
  isBallMoving = false;
  isBallInFlight = false;
  shotPower = 50;
  updatePowerDisplay();
  
  // Auto-camera tracking
  if (autoCameraEnabled) {
    controls.target.copy(ballPosition);
    controls.update();
  }
  

}

// Shot power adjustment
function adjustShotPower(increase) {
  if (increase) {
    shotPower = Math.min(MAX_POWER, shotPower + POWER_CHANGE_RATE);
  } else {
    shotPower = Math.max(MIN_POWER, shotPower - POWER_CHANGE_RATE);
  }
  updatePowerDisplay();

}

function updatePowerDisplay() {
  const powerElement = document.getElementById('shot-power');
  if (powerElement) {
    powerElement.textContent = `${shotPower}%`;
    
    // Update power bar visual
    const powerBar = document.getElementById('power-bar');
    if (powerBar) {
      powerBar.style.width = `${shotPower}%`;
      
      // Change color based on power level
      if (shotPower < 30) {
        powerBar.style.backgroundColor = '#4CAF50'; // Green for low power
      } else if (shotPower < 70) {
        powerBar.style.backgroundColor = '#FF9800'; // Orange for medium power
      } else {
        powerBar.style.backgroundColor = '#F44336'; // Red for high power
      }
    }
  }
}

// Physics and shooting
function shootBall() {
  if (isBallInFlight) return;
  if (nextShotDelay > 0) return;
  
  // Store shot position for distance calculation
  lastShotPosition.copy(ballPosition);
  shotDetected = false;
  shotResultDetermined = false;
  
  rimTouched = false;
  lastShotWasSwish = false;
  
  shotAttempts++;
  lastShotTime = Date.now();
  
  const hoopLeft = new THREE.Vector3(-HALF_LEN + RIM_TO_BASE + 0.05, RIM_H, 0);
  const hoopRight = new THREE.Vector3(HALF_LEN - RIM_TO_BASE - 0.05, RIM_H, 0);
  
  const distanceToLeft = ballPosition.distanceTo(hoopLeft);
  const distanceToRight = ballPosition.distanceTo(hoopRight);
  const targetHoop = distanceToLeft < distanceToRight ? hoopLeft : hoopRight;
  lastShotTarget = distanceToLeft < distanceToRight ? 'left' : 'right';
  
  const shotDirection = new THREE.Vector3().subVectors(targetHoop, ballPosition).normalize();
  
  const baseVelocity = 12;
  const powerMultiplier = shotPower / 100;
  const initialVelocity = baseVelocity * powerMultiplier;
  
  ballVelocity.set(
    shotDirection.x * initialVelocity * 0.7,
    initialVelocity * 1.2,
    shotDirection.z * initialVelocity * 0.7
  );
  
  isBallInFlight = true;
  physicsTime = 0;
  
  playSound('shoot');
  

}

function updatePhysics(deltaTime) {
  updateTimedMode(deltaTime);
  
  if (nextShotDelay > 0) {
    nextShotDelay -= deltaTime;
    if (nextShotDelay <= 0) {
      nextShotDelay = 0;

    }
  }
  
  if (!isBallInFlight) return;
  
  physicsTime += deltaTime;
  
  ballVelocity.y += GRAVITY * deltaTime;
  
  ballPosition.add(ballVelocity.clone().multiplyScalar(deltaTime));
  
  addTrailPoint();
  
  if (ballPosition.y <= FLOOR_Y + BALL_RAD) {
    ballPosition.y = FLOOR_Y + BALL_RAD;
    ballVelocity.y = -ballVelocity.y * 0.6;
    ballVelocity.x *= 0.8;
    ballVelocity.z *= 0.8;
    
    // Play bounce sound if velocity is significant
    if (Math.abs(ballVelocity.y) > 1.0) {
      playSound('bounce');
    }
    
    if (Math.abs(ballVelocity.y) < 0.5 && 
        Math.abs(ballVelocity.x) < 0.5 && 
        Math.abs(ballVelocity.z) < 0.5) {
      isBallInFlight = false;
      ballVelocity.set(0, 0, 0);
      ballTrail = [];

    }
  }
  
  // Check for backboard collisions
  checkBackboardCollision();
  
  // Check for rim collisions
  checkRimCollision();
  
  // Check for out of bounds
  checkOutOfBounds(deltaTime);
  
  // Check for scoring
  checkForScore();
  
  // Check for missed shots
  checkForMissedShot();
  
  // Update ball position in scene
  basketball.position.copy(ballPosition);
  
  // Auto-camera tracking during ball flight
  if (autoCameraEnabled && isBallInFlight) {
    controls.target.copy(ballPosition);
    controls.update();
  }
  
  updateTrail(deltaTime);
}

// Sound effects
function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

  } catch (e) {
    console.log('Audio not supported');
  }
}

function createSound(frequency, duration, type = 'sine') {
  if (!audioContext) return;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(SOUND_VOLUME, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

function playSound(soundType) {
  switch (soundType) {
    case 'shoot':
      createSound(800, 0.2, 'sine');
      break;
    case 'score':
      createSound(1200, 0.5, 'sine');
      setTimeout(() => createSound(1400, 0.3, 'sine'), 100);
      setTimeout(() => createSound(1600, 0.2, 'sine'), 200);
      break;
    case 'swish':
      createSound(1000, 0.3, 'sine');
      setTimeout(() => createSound(1200, 0.2, 'sine'), 150);
      break;
    case 'miss':
      createSound(400, 0.4, 'sawtooth');
      break;
    case 'bounce':
      createSound(600, 0.1, 'square');
      break;
    case 'combo':
      createSound(1000, 0.2, 'sine');
      setTimeout(() => createSound(1200, 0.2, 'sine'), 100);
      setTimeout(() => createSound(1400, 0.2, 'sine'), 200);
      break;
  }
}

// Ball trail effect
function addTrailPoint() {
  if (!isBallInFlight) return;
  
  const trailPoint = {
    position: ballPosition.clone(),
    time: 0
  };
  
  ballTrail.push(trailPoint);
  
  // Keep trail length limited
  if (ballTrail.length > TRAIL_LENGTH) {
    ballTrail.shift();
  }
}

function updateTrail(deltaTime) {
  // Update trail point times
  for (let i = 0; i < ballTrail.length; i++) {
    ballTrail[i].time += deltaTime;
  }
  
  // Remove old trail points
  ballTrail = ballTrail.filter(point => point.time < TRAIL_FADE_TIME);
  
  // Update trail visualization
  updateTrailVisualization();
}

function updateTrailVisualization() {
  // Remove existing trail from scene
  scene.children = scene.children.filter(child => !child.isTrail);
  
  // Create new trail visualization
  if (ballTrail.length > 1) {
    const trailGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    
    for (let i = 0; i < ballTrail.length; i++) {
      const point = ballTrail[i];
      const alpha = 1 - (point.time / TRAIL_FADE_TIME);
      
      positions.push(point.position.x, point.position.y, point.position.z);
      colors.push(1, 0.5, 0, alpha); // Orange trail with fade
    }
    
    trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    trailGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    
    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.isTrail = true;
    scene.add(trail);
  }
}

// Collision detection
function checkBackboardCollision() {
  // Check left backboard
  const leftBackboardX = -HALF_LEN + RIM_TO_BASE;
  const backboardY = RIM_HEIGHT + BACKBOARD_HEIGHT / 2;
  const backboardZ = 0;
  
  if (ballPosition.x <= leftBackboardX + BACKBOARD_THICKNESS + BALL_RAD &&
      ballPosition.x >= leftBackboardX - BALL_RAD &&
      ballPosition.y >= backboardY - BACKBOARD_HEIGHT / 2 - BALL_RAD &&
      ballPosition.y <= backboardY + BACKBOARD_HEIGHT / 2 + BALL_RAD &&
      ballPosition.z >= -BACKBOARD_WIDTH / 2 - BALL_RAD &&
      ballPosition.z <= BACKBOARD_WIDTH / 2 + BALL_RAD) {
    
    // Ball hit left backboard
    ballPosition.x = leftBackboardX + BACKBOARD_THICKNESS + BALL_RAD;
    ballVelocity.x = -ballVelocity.x * 0.8; // Bounce off backboard

  }
  
  // Check right backboard
  const rightBackboardX = HALF_LEN - RIM_TO_BASE;
  
  if (ballPosition.x >= rightBackboardX - BACKBOARD_THICKNESS - BALL_RAD &&
      ballPosition.x <= rightBackboardX + BALL_RAD &&
      ballPosition.y >= backboardY - BACKBOARD_HEIGHT / 2 - BALL_RAD &&
      ballPosition.y <= backboardY + BACKBOARD_HEIGHT / 2 + BALL_RAD &&
      ballPosition.z >= -BACKBOARD_WIDTH / 2 - BALL_RAD &&
      ballPosition.z <= BACKBOARD_WIDTH / 2 + BALL_RAD) {
    
    // Ball hit right backboard
    ballPosition.x = rightBackboardX - BACKBOARD_THICKNESS - BALL_RAD;
    ballVelocity.x = -ballVelocity.x * 0.8; // Bounce off backboard

  }
}

function checkRimCollision() {
  // Check left rim
  const leftRimX = -HALF_LEN + RIM_TO_BASE + 0.05;
  const rimY = RIM_HEIGHT;
  const rimZ = 0;
  
  const distanceToLeftRim = Math.sqrt(
    Math.pow(ballPosition.x - leftRimX, 2) +
    Math.pow(ballPosition.z - rimZ, 2)
  );
  
  if (distanceToLeftRim <= RIM_RADIUS + BALL_RAD &&
      ballPosition.y >= rimY - BALL_RAD &&
      ballPosition.y <= rimY + BALL_RAD) {
    
    // Ball hit left rim
    const rimNormal = new THREE.Vector3(
      ballPosition.x - leftRimX,
      0,
      ballPosition.z - rimZ
    ).normalize();
    
    // Reflect velocity off rim
    const dot = ballVelocity.dot(rimNormal);
    ballVelocity.sub(rimNormal.clone().multiplyScalar(2 * dot));
    ballVelocity.multiplyScalar(0.7); // Energy loss
    
    // Mark that rim was touched for swish detection
    rimTouched = true;

  }
  
  // Check right rim
  const rightRimX = HALF_LEN - RIM_TO_BASE - 0.05;
  
  const distanceToRightRim = Math.sqrt(
    Math.pow(ballPosition.x - rightRimX, 2) +
    Math.pow(ballPosition.z - rimZ, 2)
  );
  
  if (distanceToRightRim <= RIM_RADIUS + BALL_RAD &&
      ballPosition.y >= rimY - BALL_RAD &&
      ballPosition.y <= rimY + BALL_RAD) {
    
    // Ball hit right rim
    const rimNormal = new THREE.Vector3(
      ballPosition.x - rightRimX,
      0,
      ballPosition.z - rimZ
    ).normalize();
    
    // Reflect velocity off rim
    const dot = ballVelocity.dot(rimNormal);
    ballVelocity.sub(rimNormal.clone().multiplyScalar(2 * dot));
    ballVelocity.multiplyScalar(0.7); // Energy loss
    
    // Mark that rim was touched for swish detection
    rimTouched = true;

  }
}

function checkOutOfBounds(deltaTime) {
  // Define court boundaries - any ball outside these bounds will return
  const courtBounds = {
    minX: -HALF_LEN - 0.5, // 0.5 meters outside court
    maxX: HALF_LEN + 0.5,
    minZ: -COURT_WID/2 - 0.5,
    maxZ: COURT_WID/2 + 0.5,
    maxY: 20 // Maximum height before considered out of bounds
  };
  
  // Check if ball is out of bounds (hits black surface)
  const isOutOfBoundsNow = 
    ballPosition.x < courtBounds.minX ||
    ballPosition.x > courtBounds.maxX ||
    ballPosition.z < courtBounds.minZ ||
    ballPosition.z > courtBounds.maxZ ||
    ballPosition.y > courtBounds.maxY;
  
  // Check for weak shots that are far from center and have low velocity
  const isWeakShotOut = 
    ballPosition.y <= FLOOR_Y + BALL_RAD + 0.5 && // Ball is near ground
    (Math.abs(ballVelocity.x) < 2.0 && Math.abs(ballVelocity.z) < 2.0 && Math.abs(ballVelocity.y) < 2.0) && // Low velocity
    (ballPosition.x < -HALF_LEN + 8 || ballPosition.x > HALF_LEN - 8 || // Far from center
     ballPosition.z < -COURT_WID/2 + 5 || ballPosition.z > COURT_WID/2 - 5);
  
  if (isOutOfBoundsNow) {
    if (!isOutOfBounds) {
      // Ball just went out of bounds (hit black surface)
      isOutOfBounds = true;
      outOfBoundsTimer = 0;

    }
    
    outOfBoundsTimer += deltaTime;
    
    if (outOfBoundsTimer >= OUT_OF_BOUNDS_DELAY) {
      // Return ball to court
      returnBallToCourt();
    }
  } else if (isWeakShotOut) {
    // Weak shot detected
    weakShotTimer += deltaTime;
    
    if (weakShotTimer >= WEAK_SHOT_DELAY) {

      returnBallToCourt();
    }
  } else {
    // Ball is back in bounds or not a weak shot
    isOutOfBounds = false;
    outOfBoundsTimer = 0;
    weakShotTimer = 0;
  }
}

function returnBallToCourt() {
  // Return ball to the edge of the court on the side where it was shot from
  if (lastShotTarget === 'left') {
    // Return to left edge of court
    ballPosition.set(-HALF_LEN + BALL_RAD, FLOOR_Y + BALL_RAD, 0);

  } else {
    // Return to right edge of court
    ballPosition.set(HALF_LEN - BALL_RAD, FLOOR_Y + BALL_RAD, 0);

  }
  
  // Reset ball state
  ballVelocity.set(0, 0, 0);
  isBallInFlight = false;
  isOutOfBounds = false;
  outOfBoundsTimer = 0;
  weakShotTimer = 0;
  ballRotationSpeed = 0;
  
  // Update ball position in scene
  basketball.position.copy(ballPosition);
}

// Ball rotation
function updateBallRotation(deltaTime) {
  if (!basketball) return;
  
  // Calculate rotation based on velocity
  const velocityMagnitude = ballVelocity.length();
  
  if (velocityMagnitude > 0.1) {
    // Calculate rotation axis based on movement direction
    const normalizedVelocity = ballVelocity.clone().normalize();
    
    // For horizontal movement, rotate around Y axis
    if (Math.abs(normalizedVelocity.x) > Math.abs(normalizedVelocity.z)) {
      // Moving more in X direction
      ballRotationAxis.set(0, 0, normalizedVelocity.x > 0 ? -1 : 1);
    } else {
      // Moving more in Z direction
      ballRotationAxis.set(normalizedVelocity.z > 0 ? 1 : -1, 0, 0);
    }
    
    // Calculate rotation speed based on velocity
    ballRotationSpeed = velocityMagnitude * ROTATION_SPEED_MULTIPLIER;
    
    // Apply rotation
    const rotationAmount = ballRotationSpeed * deltaTime;
    basketball.rotateOnAxis(ballRotationAxis, rotationAmount);
  } else {
    // Slow down rotation when ball is nearly stopped
    ballRotationSpeed *= 0.95;
    if (ballRotationSpeed > 0.01) {
      basketball.rotateOnAxis(ballRotationAxis, ballRotationSpeed * deltaTime);
    }
  }
}

// Scoring system
function checkForScore() {
  if (!isBallInFlight || shotResultDetermined) return;
  
  // Check if enough time has passed since shot
  const timeSinceShot = (Date.now() - lastShotTime) / 1000;
  if (timeSinceShot < SCORE_DELAY) return;
  
  // Check left hoop
  const leftHoopX = -HALF_LEN + RIM_TO_BASE + 0.05;
  const rightHoopX = HALF_LEN - RIM_TO_BASE - 0.05;
  const hoopY = RIM_H;
  const hoopZ = 0;
  
  // Check if ball is passing through the rim opening (allowing rim shots)
  const rimOpeningRadius = RIM_RADIUS - 0.05; // Allow some tolerance for rim shots
  
  const ballInLeftHoop = 
    Math.abs(ballPosition.x - leftHoopX) < rimOpeningRadius &&
    Math.abs(ballPosition.z - hoopZ) < rimOpeningRadius &&
    ballPosition.y <= hoopY + 0.2 && // Allow ball to go slightly below rim
    ballPosition.y >= hoopY - 0.2 && // Allow ball to be slightly above rim
    ballVelocity.y < 0 && // Ball must be moving downward
    ballPosition.y > hoopY - 0.1; // Ball must be at least near rim level
  
  const ballInRightHoop = 
    Math.abs(ballPosition.x - rightHoopX) < rimOpeningRadius &&
    Math.abs(ballPosition.z - hoopZ) < rimOpeningRadius &&
    ballPosition.y <= hoopY + 0.2 && // Allow ball to go slightly below rim
    ballPosition.y >= hoopY - 0.2 && // Allow ball to be slightly above rim
    ballVelocity.y < 0 && // Ball must be moving downward
    ballPosition.y > hoopY - 0.1; // Ball must be at least near rim level
  
  if (ballInLeftHoop || ballInRightHoop) {
    // Calculate shot distance for 2-point vs 3-point
    // Distance should be from shot position to the specific hoop being targeted
    const targetHoop = ballInLeftHoop ? new THREE.Vector3(leftHoopX, hoopY, hoopZ) : new THREE.Vector3(rightHoopX, hoopY, hoopZ);
    const shotDistance = lastShotPosition.distanceTo(targetHoop);
    
    // Three-point arc radius is 6.75 meters from the hoop
    const threePointDistance = 6.75;
    const isThreePoint = shotDistance > threePointDistance;
    const points = isThreePoint ? 3 : 2;
    
    // Debug logging for 3-point detection
    console.log(`Shot distance from hoop: ${shotDistance.toFixed(2)}m, 3-point threshold: ${threePointDistance}m, Is 3-pointer: ${isThreePoint}`);
    console.log(`Shot position: (${lastShotPosition.x.toFixed(2)}, ${lastShotPosition.z.toFixed(2)}), Target hoop: (${targetHoop.x.toFixed(2)}, ${targetHoop.z.toFixed(2)})`);
    
    // Check for swish (no rim touch)
    const isSwish = !rimTouched;
    if (isSwish) {
      swishShots++;
      lastShotWasSwish = true;
  
    }
    
    // Handle combo system
    currentCombo++;
    if (currentCombo > maxCombo) {
      maxCombo = currentCombo;
    }
    
    // Calculate combo bonus
    let comboBonus = 0;
    let comboLevel = 0;
    for (let i = 0; i < COMBO_THRESHOLDS.length; i++) {
      if (currentCombo >= COMBO_THRESHOLDS[i]) {
        comboLevel = i + 1;
        comboBonus = comboLevel;
      }
    }
    
    // Successful shot!
    shotsMade++;
    totalScore += points + comboBonus;
    shootingPercentage = (shotsMade / shotAttempts) * 100;
    
    // Update team scores in real game mode
    if (currentGameMode === 'real') {
      // Determine which team scored based on shot position
      const shotFromLeftSide = lastShotPosition.x < 0;
      if (shotFromLeftSide) {
        homeScore += points;
      } else {
        awayScore += points;
      }
      updateScoreboard();
    }
    
    shotResultDetermined = true;
    nextShotDelay = NEXT_SHOT_DELAY;
    
    console.log(`${isThreePoint ? 'THREE-POINTER!' : 'TWO-POINTER!'}${isSwish ? ' SWISH!' : ''}${comboBonus > 0 ? ` COMBO x${currentCombo} (+${comboBonus})` : ''} Score: ${totalScore}, Shots Made: ${shotsMade}/${shotAttempts} (${shootingPercentage.toFixed(1)}%)`);
    
    // Play sound effects
    if (isSwish) {
      playSound('swish');
    } else {
      playSound('score');
    }
    
    // Play combo sound if applicable
    if (comboBonus > 0) {
      setTimeout(() => playSound('combo'), 300);
    }
    
    // Update UI
    updateScoreDisplay();
    
    // Show visual feedback
    showShotFeedback(true, points, isSwish, comboBonus);
  }
}

function checkForMissedShot() {
  if (!isBallInFlight || shotDetected || shotResultDetermined) return;
  
  // Check if ball has hit the ground or gone out of bounds
  const timeSinceShot = (Date.now() - lastShotTime) / 1000;
  if (timeSinceShot < 1.0) return; // Wait a bit for the shot to develop
  
  // Check if ball is near ground and has low velocity (missed shot)
  const isMissedShot = 
    ballPosition.y <= FLOOR_Y + BALL_RAD + 0.5 && 
    (Math.abs(ballVelocity.x) < 2.0 && Math.abs(ballVelocity.z) < 2.0 && Math.abs(ballVelocity.y) < 2.0);
  
  // Check if ball is out of bounds (air ball)
  const isAirBall = 
    ballPosition.x < -HALF_LEN - 1 || 
    ballPosition.x > HALF_LEN + 1 || 
    ballPosition.z < -COURT_WID/2 - 1 || 
    ballPosition.z > COURT_WID/2 + 1 ||
    ballPosition.y > 15;
  
  if (isMissedShot || isAirBall) {
    // Reset combo on missed shot
    if (currentCombo > 0) {
  
    }
    currentCombo = 0;
    
    shotDetected = true;
    shotResultDetermined = true;
    nextShotDelay = NEXT_SHOT_DELAY;
    shootingPercentage = (shotsMade / shotAttempts) * 100;
    

    
    // Play miss sound
    playSound('miss');
    
    // Update UI
    updateScoreDisplay();
    
    // Show visual feedback
    showShotFeedback(false);
  }
}

function updateScoreDisplay() {
  // Update scoreboard elements
  const homeScore = document.querySelector('#scoreboard .team-score:first-child .score');
  const awayScore = document.querySelector('#scoreboard .team-score:last-child .score');
  
  if (homeScore) {
    homeScore.textContent = totalScore.toString().padStart(3, '0');
  }
  
  // Update statistics display
  const shotsMadeElement = document.getElementById('shots-made');
  const shotAttemptsElement = document.getElementById('shot-attempts');
  const shootingPercentageElement = document.getElementById('shooting-percentage');
  const totalScoreElement = document.getElementById('total-score');
  const swishShotsElement = document.getElementById('swish-shots');
  const currentComboElement = document.getElementById('current-combo');
  const maxComboElement = document.getElementById('max-combo');
  
  if (shotsMadeElement) {
    shotsMadeElement.textContent = shotsMade;
  }
  if (shotAttemptsElement) {
    shotAttemptsElement.textContent = shotAttempts;
  }
  if (shootingPercentageElement) {
    shootingPercentageElement.textContent = `${shootingPercentage.toFixed(1)}%`;
  }
  if (totalScoreElement) {
    totalScoreElement.textContent = totalScore;
  }
  if (swishShotsElement) {
    swishShotsElement.textContent = swishShots;
  }
  if (currentComboElement) {
    currentComboElement.textContent = currentCombo;
  }
  if (maxComboElement) {
    maxComboElement.textContent = maxCombo;
  }
  
  // Update game status
  updateGameStatus();
  
  // Update jumbotron if it exists
  if (jumbotron && jumbotron.redraw) {
    jumbotron.redraw();
  }
}

function updateScoreboard() {
  // Update scoreboard elements
  const homeScoreElement = document.querySelector('#scoreboard .team-score:first-child .score');
  const awayScoreElement = document.querySelector('#scoreboard .team-score:last-child .score');
  const periodElement = document.querySelector('#scoreboard .period');
  const timeElement = document.querySelector('#scoreboard .time');
  
  if (homeScoreElement) {
    homeScoreElement.textContent = homeScore.toString().padStart(3, '0');
  }
  
  if (awayScoreElement) {
    awayScoreElement.textContent = awayScore.toString().padStart(3, '0');
  }
  
  if (periodElement) {
    if (currentGameMode === 'real') {
      periodElement.textContent = `${currentQuarter}ST`;
    } else {
      periodElement.textContent = '1ST';
    }
  }
  
  if (timeElement) {
    if (currentGameMode === 'real') {
      const minutes = Math.floor(quarterTimeRemaining / 60);
      const seconds = Math.floor(quarterTimeRemaining % 60);
      timeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      timeElement.textContent = '12:00';
    }
  }
}

function resetGameStats() {
  // Reset all game statistics
  totalScore = 0;
  shotAttempts = 0;
  shotsMade = 0;
  shootingPercentage = 0;
  swishShots = 0;
  currentCombo = 0;
  maxCombo = 0;
  
  // Always return to free mode and reset all game mode variables
  currentGameMode = 'free';
  gameActive = false;
  isRealGameActive = false;
  timeRemaining = gameTime;
  quarterTimeRemaining = quarterTime;
  currentQuarter = 1;
  homeScore = 0;
  awayScore = 0;
  
  // Reset shot-related variables
  shotResultDetermined = false;
  nextShotDelay = 0;
  rimTouched = false;
  lastShotWasSwish = false;
  
  // Reset out-of-bounds variables
  outOfBoundsTimer = 0;
  isOutOfBoundsNow = false;
  
  // Reset ball trail
  ballTrail = [];
  
  // Update all displays
  updateScoreDisplay();
  updateGameModeDisplay();
  updateScoreboard();
  

}

// Game modes
function startTimedMode() {
  currentGameMode = 'timed';
  gameActive = true;
  timeRemaining = gameTime;
  gameStartTime = Date.now();
  
  // Reset statistics for new game
  totalScore = 0;
  shotAttempts = 0;
  shotsMade = 0;
  swishShots = 0;
  currentCombo = 0;
  maxCombo = 0;
  

  updateGameModeDisplay();
}

function startRealGameMode() {
  currentGameMode = 'real';
  isRealGameActive = true;
  currentQuarter = 1;
  quarterTimeRemaining = quarterTime;
  homeScore = 0;
  awayScore = 0;
  
  // Reset statistics for new game
  totalScore = 0;
  shotAttempts = 0;
  shotsMade = 0;
  swishShots = 0;
  currentCombo = 0;
  maxCombo = 0;
  

  updateGameModeDisplay();
  updateScoreboard();
}

function endTimedMode() {
  gameActive = false;
  currentGameMode = 'free';
  

  showGameEndFeedback();
  updateGameModeDisplay();
  
  // Reset all stats after showing feedback
  setTimeout(() => {
    resetGameStats();
  }, 5000); // Reset after feedback disappears
}

function endRealGameMode() {
  isRealGameActive = false;
  currentGameMode = 'free';
  

  showRealGameEndFeedback();
  updateGameModeDisplay();
  
  // Reset all stats after showing feedback
  setTimeout(() => {
    resetGameStats();
  }, 5000); // Reset after feedback disappears
}

function updateTimedMode(deltaTime) {
  if (currentGameMode === 'timed' && gameActive) {
    timeRemaining -= deltaTime;
    
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      endTimedMode();
    }
    
    updateGameModeDisplay();
  } else if (currentGameMode === 'real' && isRealGameActive) {
    quarterTimeRemaining -= deltaTime;
    
    if (quarterTimeRemaining <= 0) {
      // End of quarter
      if (currentQuarter < 4) {
        currentQuarter++;
        quarterTimeRemaining = quarterTime;
    
      } else {
        // End of game
        quarterTimeRemaining = 0;
        endRealGameMode();
      }
    }
    
    updateGameModeDisplay();
    updateScoreboard();
  }
}

function updateGameModeDisplay() {
  const modeElement = document.getElementById('game-mode');
  const timeElement = document.getElementById('time-remaining');
  const timeDisplay = document.getElementById('time-display');
  

  
  if (modeElement) {
    if (currentGameMode === 'timed') {
      modeElement.textContent = 'TIMED MODE';
    } else if (currentGameMode === 'real') {
      modeElement.textContent = `Q${currentQuarter}`;
    } else {
      modeElement.textContent = 'FREE SHOOT';
    }
  }
  
  if (timeDisplay) {
    timeDisplay.style.display = (currentGameMode === 'timed' || currentGameMode === 'real') ? 'flex' : 'none';
  }
  
  if (timeElement) {
    if (currentGameMode === 'timed') {
      timeElement.textContent = Math.ceil(timeRemaining);
      
      // Add warning color when time is low
      if (timeRemaining <= 10) {
        timeElement.style.color = '#FF0000';
        timeElement.style.textShadow = '0 0 15px rgba(255, 0, 0, 0.8)';
      } else {
        timeElement.style.color = '#FF6B6B';
        timeElement.style.textShadow = '0 0 10px rgba(255, 107, 107, 0.5)';
      }
    } else if (currentGameMode === 'real') {
      const minutes = Math.floor(quarterTimeRemaining / 60);
      const seconds = Math.floor(quarterTimeRemaining % 60);
      timeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Add warning color when time is low
      if (quarterTimeRemaining <= 10) {
        timeElement.style.color = '#FF0000';
        timeElement.style.textShadow = '0 0 15px rgba(255, 0, 0, 0.8)';
      } else {
        timeElement.style.color = '#FF6B6B';
        timeElement.style.textShadow = '0 0 10px rgba(255, 107, 107, 0.5)';
      }
    }
  }
}

function showGameEndFeedback() {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #FFD700;
    color: #000;
    padding: 30px 50px;
    border-radius: 15px;
    font-size: 28px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 6px 30px rgba(0,0,0,0.7);
    animation: feedbackPop 0.5s ease-out;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 2px;
    text-align: center;
  `;
  
  feedback.innerHTML = `
    <div>GAME OVER!</div>
    <div style="font-size: 20px; margin-top: 10px;">
      Final Score: ${totalScore} points<br>
      Shots Made: ${shotsMade}/${shotAttempts}<br>
      Swishes: ${swishShots}<br>
      Best Combo: ${maxCombo}
    </div>
  `;
  
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.style.animation = 'feedbackFade 0.8s ease-out';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 800);
    }
  }, 4000);
}

function showRealGameEndFeedback() {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #FFD700;
    color: #000;
    padding: 30px 50px;
    border-radius: 15px;
    font-size: 28px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 6px 30px rgba(0,0,0,0.7);
    animation: feedbackPop 0.5s ease-out;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 2px;
    text-align: center;
  `;
  
  const winner = homeScore > awayScore ? 'HOME TEAM' : awayScore > homeScore ? 'AWAY TEAM' : 'TIE';
  
  feedback.innerHTML = `
    <div>GAME OVER!</div>
    <div style="font-size: 20px; margin-top: 10px;">
      Final Score: HOME ${homeScore} - AWAY ${awayScore}<br>
      Winner: ${winner}<br>
      Shots Made: ${shotsMade}/${shotAttempts}<br>
      Swishes: ${swishShots}<br>
      Best Combo: ${maxCombo}
    </div>
  `;
  
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.style.animation = 'feedbackFade 0.8s ease-out';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 800);
    }
  }, 5000);
}

// Initialize audio system
initAudio();

// Initialize game mode button and scoreboard
document.addEventListener('DOMContentLoaded', () => {
  const resetGameButton = document.getElementById('reset-game-button');
  

  
  if (resetGameButton) {
    resetGameButton.addEventListener('click', () => {

      
      try {
        // Reset current game but keep the same mode
        if (currentGameMode === 'timed') {
          timeRemaining = gameTime;
          gameActive = true;
  
        } else if (currentGameMode === 'real') {
          quarterTimeRemaining = quarterTime;
          currentQuarter = 1;
          homeScore = 0;
          awayScore = 0;
          isRealGameActive = true;
  
        }
        
        // Reset statistics but keep game mode
        totalScore = 0;
        shotAttempts = 0;
        shotsMade = 0;
        shootingPercentage = 0;
        swishShots = 0;
        currentCombo = 0;
        maxCombo = 0;
        
        // Reset ball position
        ballPosition.set(0, FLOOR_Y + BALL_RAD, 0);
        ballVelocity.set(0, 0, 0);
        basketball.position.copy(ballPosition);
        isBallMoving = false;
        isBallInFlight = false;
        shotPower = 50;
        updatePowerDisplay();
        
        // Update displays
        updateScoreDisplay();
        updateScoreboard();
        updateGameModeDisplay();
        
        // Show feedback
        showResetGameFeedback();
        

      } catch (error) {
        console.error('Error in reset game button:', error);
      }
    });
  }
  
  // Initialize scoreboard
  updateScoreboard();
  
  // Initialize auto-camera status
  const autoCameraStatus = document.getElementById('auto-camera-status');
  if (autoCameraStatus) {
    autoCameraStatus.textContent = 'On';
  }
});

function updateGameStatus() {
  const ballStatusElement = document.getElementById('ball-status');
  const nextShotElement = document.getElementById('next-shot-status');
  
  if (ballStatusElement) {
    if (isBallInFlight) {
      ballStatusElement.textContent = 'In Flight';
      ballStatusElement.className = 'warning';
    } else if (isOutOfBounds) {
      ballStatusElement.textContent = 'Out of Bounds';
      ballStatusElement.className = 'error';
    } else {
      ballStatusElement.textContent = 'Ready';
      ballStatusElement.className = '';
    }
  }
  
  if (nextShotElement) {
    if (nextShotDelay > 0) {
      const timeLeft = Math.ceil(nextShotDelay);
      nextShotElement.textContent = `${timeLeft}s`;
      nextShotElement.className = 'warning';
    } else {
      nextShotElement.textContent = 'Available';
      nextShotElement.className = '';
    }
  }
}

function showResetGameFeedback() {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffc107;
    color: #000;
    padding: 25px 40px;
    border-radius: 12px;
    font-size: 22px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 6px 25px rgba(255, 193, 7, 0.4);
    animation: feedbackPop 0.4s ease-out;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 1.5px;
    text-align: center;
  `;
  
  feedback.innerHTML = `
    <div>GAME RESET!</div>
    <div style="font-size: 16px; margin-top: 8px; opacity: 0.9;">
      Game restarted with same mode
    </div>
  `;
  
  document.body.appendChild(feedback);
  
  // Remove feedback after 3 seconds
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.style.animation = 'feedbackFade 0.5s ease-out';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 500);
    }
  }, 3000);
}

function showEndGameFeedback() {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ff4d4d;
    color: white;
    padding: 25px 40px;
    border-radius: 12px;
    font-size: 22px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 6px 25px rgba(255, 77, 77, 0.4);
    animation: feedbackPop 0.4s ease-out;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 1.5px;
    text-align: center;
  `;
  
  feedback.innerHTML = `
    <div>GAME ENDED!</div>
    <div style="font-size: 16px; margin-top: 8px; opacity: 0.9;">
      All data reset to zero
    </div>
  `;
  
  document.body.appendChild(feedback);
  
  // Remove feedback after 3 seconds
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.style.animation = 'feedbackFade 0.5s ease-out';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 500);
    }
  }, 3000);
}

function showShotFeedback(success, points = 0, isSwish = false, comboBonus = 0) {
  // Create temporary feedback message
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${success ? '#4CAF50' : '#F44336'};
    color: white;
    padding: 20px 40px;
    border-radius: 10px;
    font-size: 24px;
    font-weight: bold;
    z-index: 2000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    animation: feedbackPop 0.3s ease-out;
    font-family: 'Orbitron', sans-serif;
    letter-spacing: 1px;
  `;
  
  if (success) {
    let shotText = points === 3 ? 'THREE-POINTER!' : 'TWO-POINTER!';
    if (isSwish) {
      shotText = points === 3 ? 'THREE-POINTER SWISH!' : 'TWO-POINTER SWISH!';
      feedback.style.background = '#FF6B35'; // Orange for swish
      feedback.style.color = '#fff';
    } else {
      feedback.style.background = points === 3 ? '#FFD700' : '#4CAF50';
      feedback.style.color = points === 3 ? '#000' : '#fff';
    }
    
    if (comboBonus > 0) {
      shotText += `\nCOMBO x${currentCombo} (+${comboBonus})`;
      feedback.style.background = '#9C27B0'; // Purple for combo
      feedback.style.color = '#fff';
    }
    
    feedback.textContent = shotText;
  } else {
    feedback.textContent = 'MISSED SHOT';
  }
  
  document.body.appendChild(feedback);
  
  // Remove after 2 seconds
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.style.animation = 'feedbackFade 0.5s ease-out';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 500);
    }
  }, 2000);
}

document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'o') {
    orbitEnabled = !orbitEnabled;
    controls.enabled = orbitEnabled;

  }
  
  if (e.key.toLowerCase() === 'r') {
    resetBall();
  }
  
  if (e.key.toLowerCase() === 'b') {
    autoCameraEnabled = !autoCameraEnabled;
    if (autoCameraEnabled) {
      controls.target.copy(ballPosition);
      controls.update();
    }
    
    // Update auto-camera status display
    const autoCameraStatus = document.getElementById('auto-camera-status');
    if (autoCameraStatus) {
      autoCameraStatus.textContent = autoCameraEnabled ? 'On' : 'Off';
    }
  }
  
  // Basketball movement controls
  if (e.key === 'ArrowLeft') {
    moveBall('left');
  } else if (e.key === 'ArrowRight') {
    moveBall('right');
  } else if (e.key === 'ArrowUp') {
    moveBall('forward');
  } else if (e.key === 'ArrowDown') {
    moveBall('backward');
  }
  
  // Shot power controls
  if (e.key.toLowerCase() === 'w') {
    adjustShotPower(true); // Increase power
  } else if (e.key.toLowerCase() === 's') {
    adjustShotPower(false); // Decrease power
  }
  
  // Shooting control
  if (e.code === 'Space') {
    e.preventDefault(); // Prevent page scroll
    shootBall();
  }
  
  // Game mode controls
  if (e.key.toLowerCase() === 't') {
    if (currentGameMode === 'free') {
      startTimedMode();
    } else if (currentGameMode === 'timed') {
      endTimedMode();
    }
  }
  
  if (e.key.toLowerCase() === 'y') {
    if (currentGameMode === 'free') {
      startRealGameMode();
    } else if (currentGameMode === 'real') {
      endRealGameMode();
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(currentTime) {
  requestAnimationFrame(animate);
  
  // Calculate delta time for physics
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  // Update physics
  updatePhysics(deltaTime);
  
  // Update ball rotation
  updateBallRotation(deltaTime);
  
  if (jumbotron) {
    jumbotron.redraw();
    jumbotron.texture.needsUpdate = true;
    
    // Add subtle rotation animation to jumbotron
    if (jumbotron.mesh && jumbotron.mesh.userData.rotationSpeed) {
      jumbotron.mesh.rotation.y += jumbotron.mesh.userData.rotationSpeed;
    }
  }
  if (orbitEnabled) {
    controls.update();
  }
  
  // Reset ball movement state after a short delay
  if (isBallMoving) {
    setTimeout(() => {
      isBallMoving = false;
    }, 50);
  }
  
  renderer.render(scene, camera);
}

// Initialize UI
updatePowerDisplay();
updateScoreDisplay();
updateGameStatus();

// Update UI regularly
setInterval(() => {
  updateGameStatus();
}, 100);

// Help overlay functionality
document.addEventListener('DOMContentLoaded', () => {
  const helpToggle = document.getElementById('help-toggle');
  const helpOverlay = document.getElementById('help-overlay');
  const helpClose = document.getElementById('help-close');
  
  if (helpToggle && helpOverlay && helpClose) {
    helpToggle.addEventListener('click', () => {
      helpOverlay.style.display = 'flex';
    });
    
    helpClose.addEventListener('click', () => {
      helpOverlay.style.display = 'none';
    });
    
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) {
        helpOverlay.style.display = 'none';
      }
    });
  }
});

animate();