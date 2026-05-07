import * as THREE from "../vendor/three.module.js";

const host = document.querySelector("[data-workflow-scene]");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (host && !prefersReducedMotion) {
  initWorkflowScene(host);
}

function initWorkflowScene(container) {
  if (!isWebGLAvailable()) return;

  const frame = container.closest(".signal-board-poster");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1120);

  const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x0b1120, 1);
  container.appendChild(renderer.domElement);

  const root = new THREE.Group();
  root.rotation.x = -0.14;
  root.rotation.y = -0.06;
  scene.add(root);

  addGlowPlanes(root);
  addGrid(root);
  addOrbit(root);
  const nodes = addNodes(root);
  addAmbientPoints(root);

  const wide = new THREE.Vector3(0, 0.08, 7.2);
  const stops = [
    { look: nodes.intake.position, camera: new THREE.Vector3(-1.38, 0.72, 5.2) },
    { look: nodes.safety.position, camera: new THREE.Vector3(1.26, 0.58, 5.1) },
    { look: nodes.follow.position, camera: new THREE.Vector3(-1.08, -0.62, 5.05) },
    { look: nodes.review.position, camera: new THREE.Vector3(1.12, -0.64, 5.05) },
    { look: new THREE.Vector3(0, 0, 0), camera: wide },
  ];
  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  let resizeObserver;
  let raf = 0;

  function resize() {
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    const elapsed = clock.getElapsedTime();
    const segmentDuration = 3.8;
    const segment = Math.floor(elapsed / segmentDuration) % stops.length;
    const next = (segment + 1) % stops.length;
    const amount = smoothstep((elapsed % segmentDuration) / segmentDuration);
    const currentStop = stops[segment];
    const nextStop = stops[next];

    cameraTarget.lerpVectors(currentStop.camera, nextStop.camera, amount);
    lookTarget.lerpVectors(currentStop.look, nextStop.look, amount);

    camera.position.copy(cameraTarget);
    camera.position.x += Math.sin(elapsed * 0.48) * 0.06;
    camera.position.y += Math.cos(elapsed * 0.38) * 0.035;
    camera.lookAt(lookTarget);

    root.rotation.z = Math.sin(elapsed * 0.22) * 0.025;
    Object.values(nodes).forEach((node, index) => {
      node.position.z = node.userData.baseZ + Math.sin(elapsed * 0.82 + index) * 0.035;
    });

    renderer.render(scene, camera);
    raf = window.requestAnimationFrame(render);
  }

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  frame?.classList.add("is-3d-ready");
  render();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(raf);
    } else {
      clock.getDelta();
      render();
    }
  });

  window.addEventListener("pagehide", () => {
    resizeObserver?.disconnect();
    window.cancelAnimationFrame(raf);
    renderer.dispose();
  }, { once: true });
}

function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

function addGlowPlanes(root) {
  const glows = [
    { color: 0xf0d060, x: -2.6, y: 1.18, size: 2.2, opacity: 0.16 },
    { color: 0x8a8bdd, x: 1.9, y: 0.95, size: 2.1, opacity: 0.14 },
    { color: 0xc4456a, x: -1.7, y: -1.08, size: 2.6, opacity: 0.18 },
    { color: 0x67d9b0, x: 1.85, y: -1.08, size: 2.4, opacity: 0.20 },
  ];

  glows.forEach((glow) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture(glow.color),
      transparent: true,
      opacity: glow.opacity,
      depthWrite: false,
    }));
    sprite.position.set(glow.x, glow.y, -0.95);
    sprite.scale.set(glow.size, glow.size, 1);
    root.add(sprite);
  });
}

function addGrid(root) {
  const material = new THREE.LineBasicMaterial({ color: 0xefeaff, transparent: true, opacity: 0.13 });
  const strongMaterial = new THREE.LineBasicMaterial({ color: 0xb8b4d1, transparent: true, opacity: 0.22 });
  const lines = [];
  const width = 5.7;
  const height = 3.05;

  for (let i = -6; i <= 6; i += 1) {
    const x = (i / 6) * (width / 2);
    lines.push(x, -height / 2, -0.62, x * 0.86, height / 2, -0.42);
  }

  for (let j = -4; j <= 4; j += 1) {
    const y = (j / 4) * (height / 2);
    lines.push(-width / 2, y, -0.52, width / 2, y, -0.52);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  root.add(new THREE.LineSegments(geometry, material));

  const borderGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.9, -1.55, -0.5),
    new THREE.Vector3(2.9, -1.55, -0.5),
    new THREE.Vector3(2.9, 1.55, -0.5),
    new THREE.Vector3(-2.9, 1.55, -0.5),
    new THREE.Vector3(-2.9, -1.55, -0.5),
  ]);
  root.add(new THREE.Line(borderGeometry, strongMaterial));
}

function addOrbit(root) {
  const curve = new THREE.EllipseCurve(0, 0, 2.38, 1.26, 0, Math.PI * 2, false, -0.22);
  const points = curve.getPoints(160).map((point) => new THREE.Vector3(point.x, point.y, -0.16));
  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xf0d060, transparent: true, opacity: 0.46 })
  );
  root.add(orbit);

  const accentCurve = new THREE.EllipseCurve(0.1, -0.1, 1.92, 0.98, 0, Math.PI * 2, false, 0.52);
  const accent = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(accentCurve.getPoints(120).map((point) => new THREE.Vector3(point.x, point.y, -0.2))),
    new THREE.LineBasicMaterial({ color: 0x8a8bdd, transparent: true, opacity: 0.18 })
  );
  root.add(accent);
}

function addNodes(root) {
  const specs = {
    intake: { label: "Intake", color: "#f0d060", text: "#080b1b", position: [-1.62, 0.78, 0.16], scale: [1.1, 0.38, 1] },
    safety: { label: "Safety", color: "#b7b8ff", text: "#080b1b", position: [1.42, 0.38, 0.22], scale: [1.1, 0.38, 1] },
    follow: { label: "Follow-up", color: "#e8845a", text: "#080b1b", position: [-1.28, -0.82, 0.18], scale: [1.25, 0.4, 1] },
    review: { label: "Review", color: "#67d9b0", text: "#080b1b", position: [1.24, -0.86, 0.24], scale: [1.2, 0.4, 1] },
  };

  return Object.fromEntries(Object.entries(specs).map(([key, spec]) => {
    const material = new THREE.SpriteMaterial({
      map: createNodeTexture(spec),
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...spec.position);
    sprite.userData.baseZ = spec.position[2];
    sprite.scale.set(...spec.scale);
    root.add(sprite);
    return [key, sprite];
  }));
}

function addAmbientPoints(root) {
  const points = [
    [-0.1, 0.0, 0.08, 0xf0d060],
    [-1.5, -0.42, 0.06, 0xe8845a],
    [0.72, 0.42, 0.06, 0x8a8bdd],
    [1.9, -0.5, 0.08, 0x67d9b0],
  ];

  points.forEach(([x, y, z, color]) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture(color),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.set(0.11, 0.11, 1);
    root.add(sprite);
  });
}

function createNodeTexture({ label, color, text }) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const radius = 102;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = "rgba(3, 5, 14, 0.42)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 24;
  roundedRect(ctx, 70, 38, 580, 150, radius);
  ctx.fillStyle = color;
  ctx.fill();

  const gradient = ctx.createLinearGradient(70, 38, 650, 188);
  gradient.addColorStop(0, "rgba(255,255,255,0.34)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(0,0,0,0.16)");
  roundedRect(ctx, 70, 38, 580, 150, radius);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(138, 76);
  ctx.bezierCurveTo(250, 44, 466, 44, 582, 76);
  ctx.stroke();

  ctx.fillStyle = text;
  ctx.font = "900 58px Sora, Work Sans, Avenir Next, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, 114);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture(colorValue) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const color = new THREE.Color(colorValue);
  const rgb = `${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}`;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, `rgba(${rgb}, 0.85)`);
  gradient.addColorStop(0.38, `rgba(${rgb}, 0.28)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function smoothstep(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}
