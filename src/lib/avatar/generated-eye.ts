import * as THREE from "three";

type Point = [number, number, number];
type ArcSample = { y: number; z: number };
type EyeColumn = { x: number; upper: ArcSample; lower: ArcSample };
type EyeData = {
  columns: EyeColumn[]; center: THREE.Vector3; width: number; height: number;
  frontSign: number; surface: THREE.Mesh; upperLid: THREE.Mesh; lowerLid: THREE.Mesh;
  iris: THREE.IUniform<THREE.Vector2>; baseIris: THREE.Vector2;
};
const COLUMNS = 33;
const ROWS = 12;

export function finiteWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

function sample(arc: THREE.Vector3[], x: number): ArcSample {
  if (x <= arc[0].x) return arc[0];
  for (let i = 1; i < arc.length; i++) {
    if (x <= arc[i].x) {
      const t = (x - arc[i - 1].x) / Math.max(arc[i].x - arc[i - 1].x, 1e-8);
      return { y: THREE.MathUtils.lerp(arc[i - 1].y, arc[i].y, t), z: THREE.MathUtils.lerp(arc[i - 1].z, arc[i].z, t) };
    }
  }
  return arc[arc.length - 1];
}

function grid(rows: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(COLUMNS * (rows + 1) * 3), 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(COLUMNS * (rows + 1) * 2), 2));
  const indices: number[] = [];
  for (let i = 0; i < COLUMNS - 1; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = a + rows + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  geometry.setIndex(indices);
  return geometry;
}

/** A curved eye surface bounded by the actual MediaPipe lash contour.
 * Iris/pupil are shaded on that same surface: they cannot float through lids,
 * disappear inside a globe, or reveal a white sphere outside the socket.
 */
export function makeFittedEye(points: Point[], centerIndex: number, ring: number[], skin: THREE.MeshStandardMaterial, side: string, frontSign: number): THREE.Group {
  const contour = ring.map((i) => new THREE.Vector3(...points[i]));
  const center = contour.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / contour.length);
  const minX = Math.min(...contour.map((p) => p.x)), maxX = Math.max(...contour.map((p) => p.x));
  const width = Math.max(maxX - minX, 0.001);
  const height = Math.max(Math.max(...contour.map((p) => p.y)) - Math.min(...contour.map((p) => p.y)), width * 0.04);
  // Ring ordering, not a Y threshold, preserves both canthi on tilted eyes.
  const lower = contour.slice(0, 9).sort((a, b) => a.x - b.x);
  const upper = [...contour.slice(8), contour[0]].sort((a, b) => a.x - b.x);
  const columns = Array.from({ length: COLUMNS }, (_, i) => {
    const x = THREE.MathUtils.lerp(minX, maxX, i / (COLUMNS - 1));
    return { x, upper: sample(upper, x), lower: sample(lower, x) };
  });
  const eye = new THREE.Group();
  eye.name = "AvatarAceEye_" + side;
  // The socket origin is its measured centre, never the head/world origin.
  eye.position.copy(center);
  eye.userData.basePosition = center.clone();
  const irisCenter = new THREE.Vector2(points[centerIndex][0] - center.x, points[centerIndex][1] - center.y);
  // Use the four actual iris-rim landmarks when available, with conservative
  // anatomical bounds for sparse/bad source detections.
  const measuredRadius = points.slice(centerIndex + 1, centerIndex + 5).reduce((sum, p) => sum + Math.hypot(p[0] - points[centerIndex][0], p[1] - points[centerIndex][1]), 0) / 4;
  const irisRadius = THREE.MathUtils.clamp(measuredRadius || width * 0.23, width * 0.21, width * 0.26);
  irisCenter.x = THREE.MathUtils.clamp(irisCenter.x, -width * 0.1, width * 0.1);
  irisCenter.y = THREE.MathUtils.clamp(irisCenter.y, -height * 0.08, height * 0.08);
  const iris = { value: irisCenter.clone() };
  const white = new THREE.Color(0xd1cbc3);
  const irisColor = new THREE.Color(0x59402d);
  const pupilColor = new THREE.Color(0x100d0b);
  const material = new THREE.MeshStandardMaterial({ color: white, roughness: 0.48, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { eyeIris: iris, eyeRadius: { value: irisRadius }, eyeWhite: { value: white }, eyeIrisColor: { value: irisColor }, eyePupilColor: { value: pupilColor } });
    shader.vertexShader = "varying vec2 fittedEyeXY; varying vec2 fittedEyeUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nfittedEyeXY = position.xy; fittedEyeUV = uv;");
    shader.fragmentShader = "varying vec2 fittedEyeXY; varying vec2 fittedEyeUV; uniform vec2 eyeIris; uniform float eyeRadius; uniform vec3 eyeWhite; uniform vec3 eyeIrisColor; uniform vec3 eyePupilColor;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 irisDelta = fittedEyeXY - eyeIris;
      float r = length(irisDelta) / eyeRadius;
      float angle = atan(irisDelta.y, irisDelta.x);
      float fibres = 0.90 + 0.10 * sin(angle * 43.0 + r * 12.0) * sin(angle * 71.0 - r * 8.0);
      vec3 irisShade = eyeIrisColor * fibres * mix(1.0, 0.45, smoothstep(0.82, 1.0, r));
      vec3 eyeShade = mix(irisShade, eyeWhite, smoothstep(0.96, 1.02, r));
      eyeShade = mix(eyePupilColor, eyeShade, smoothstep(0.33, 0.39, r));
      float socketShade = mix(0.67, 1.0, smoothstep(0.0, 0.24, fittedEyeUV.y)) * mix(0.78, 1.0, smoothstep(0.0, 0.18, 1.0 - fittedEyeUV.y));
      diffuseColor.rgb = eyeShade * socketShade;
    `);
  };
  material.customProgramCacheKey = () => "avatarace-contour-eye-v1";
  const surface = new THREE.Mesh(grid(ROWS), material);
  surface.name = "AvatarAceEyeball_" + side;
  eye.add(surface);
  const makeLid = (upperLid: boolean) => {
    const lidMaterial = skin.clone();
    lidMaterial.side = THREE.DoubleSide;
    lidMaterial.roughness = 0.82;
    const lid = new THREE.Mesh(grid(1), lidMaterial);
    lid.name = (upperLid ? "AvatarAceUpperBlinkLid_" : "AvatarAceLowerBlinkLid_") + side;
    lid.userData.avatarSkinToneMultiplier = 1;
    eye.add(lid);
    return lid;
  };
  const data: EyeData = { columns, center, width, height, frontSign, surface, upperLid: makeLid(true), lowerLid: makeLid(false), iris, baseIris: irisCenter };
  eye.userData.fittedEye = data;
  eye.userData.upperBlinkLid = data.upperLid;
  eye.userData.lowerBlinkLid = data.lowerLid;
  eye.userData.eyeCenter = center;
  eye.userData.lidHeight = height;
  deformFittedEye(eye, 0, 0);
  return eye;
}

export function deformFittedEye(eye: THREE.Group, closure: number, wide: number): void {
  const data = eye.userData.fittedEye as EyeData;
  const close = finiteWeight(closure), openWide = finiteWeight(wide);
  const { columns, center, height, width, frontSign, surface, upperLid, lowerLid } = data;
  const positions = surface.geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = surface.geometry.getAttribute("uv") as THREE.BufferAttribute;
  const up = upperLid.geometry.getAttribute("position") as THREE.BufferAttribute;
  const down = lowerLid.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i], gap = Math.max(0, c.upper.y - c.lower.y);
    // Neutral lids slightly overlap the iris. Wide never exceeds the source
    // contour; corners stay anchored and lids meet on the same seam at 100%.
    const neutralUpper = c.upper.y - gap * (0.06 - openWide * 0.05);
    const neutralLower = c.lower.y + gap * 0.025;
    const seam = c.lower.y + gap * 0.38;
    const top = THREE.MathUtils.lerp(neutralUpper, seam, close);
    const bottom = THREE.MathUtils.lerp(neutralLower, seam, close);
    const x = c.x - center.x;
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const z = THREE.MathUtils.lerp(c.upper.z, c.lower.z, t) - center.z;
      // Shallow curvature, recessed at lash margins; never a protruding globe.
      const dome = Math.sin(Math.PI * i / (COLUMNS - 1)) * Math.sin(Math.PI * t) * Math.min(height * 0.12, width * 0.025);
      positions.setXYZ(i * (ROWS + 1) + j, x, THREE.MathUtils.lerp(top, bottom, t) - center.y, z + frontSign * dome);
      uv.setXY(i * (ROWS + 1) + j, i / (COLUMNS - 1), t);
    }
    const rim = gap * 0.025;
    // Thin rest margins, not full-height slabs over the brow/socket.
    up.setXYZ(i * 2, x, c.upper.y + rim - center.y, c.upper.z - center.z + frontSign * height * 0.005);
    up.setXYZ(i * 2 + 1, x, top - center.y, THREE.MathUtils.lerp(c.upper.z, c.lower.z, close * 0.62) - center.z + frontSign * height * 0.015);
    down.setXYZ(i * 2, x, bottom - center.y, THREE.MathUtils.lerp(c.lower.z, c.upper.z, close * 0.38) - center.z + frontSign * height * 0.015);
    down.setXYZ(i * 2 + 1, x, c.lower.y - rim - center.y, c.lower.z - center.z + frontSign * height * 0.005);
  }
  surface.visible = close < 0.999;
  for (const mesh of [surface, upperLid, lowerLid]) {
    mesh.geometry.getAttribute("position").needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }
  uv.needsUpdate = true;
}

/** Project lid UVs onto the existing reconstructed head. No new texture/model
 * generation, and no global skin swatch painted over the user's eyelids.
 */
export function matchFittedLidMaterials(root: THREE.Object3D, headGeometry: THREE.BufferGeometry, headMaterial: THREE.MeshStandardMaterial): void {
  const pos = headGeometry.getAttribute("position"), uv = headGeometry.getAttribute("uv"), index = headGeometry.getIndex();
  if (!headMaterial.map || !pos || !uv) return;
  const triangle = new THREE.Triangle(), query = new THREE.Vector3(), nearest = new THREE.Vector3(), bary = new THREE.Vector3();
  root.traverse((object) => {
    const eye = object as THREE.Group;
    const data = eye.userData.fittedEye as EyeData | undefined;
    if (!data) return;
    for (const lid of [data.upperLid, data.lowerLid]) {
      const lidPos = lid.geometry.getAttribute("position"), lidUv = lid.geometry.getAttribute("uv") as THREE.BufferAttribute;
      for (let v = 0; v < lidPos.count; v++) {
        query.fromBufferAttribute(lidPos, v).add(data.center);
        const column = data.columns[Math.floor(v / 2)];
        const gap = Math.max(0, column.upper.y - column.lower.y);
        // Sample skin OUTSIDE the lash contour, not the source photo's eye
        // white/iris. Both strip rows retain skin when stretched for a blink.
        query.y = lid === data.upperLid ? column.upper.y + gap * 0.15 : column.lower.y - gap * 0.15;
        let best = Infinity, bestU = 0, bestV = 0;
        const count = index ? index.count : pos.count;
        for (let t = 0; t < count; t += 3) {
          const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
          triangle.a.fromBufferAttribute(pos, a); triangle.b.fromBufferAttribute(pos, b); triangle.c.fromBufferAttribute(pos, c);
          triangle.closestPointToPoint(query, nearest);
          const distance = query.distanceToSquared(nearest);
          if (distance >= best || !triangle.getBarycoord(nearest, bary)) continue;
          best = distance;
          bestU = uv.getX(a) * bary.x + uv.getX(b) * bary.y + uv.getX(c) * bary.z;
          bestV = uv.getY(a) * bary.x + uv.getY(b) * bary.y + uv.getY(c) * bary.z;
        }
        lidUv.setXY(v, bestU, bestV);
      }
      lidUv.needsUpdate = true;
      (lid.material as THREE.Material).dispose();
      const material = headMaterial.clone();
      // The thin eyelid has its own fitted geometry, not the head's sculpt map.
      material.normalMap = null; material.displacementMap = null; material.aoMap = null;
      material.side = THREE.DoubleSide;
      material.color.set(0xffffff);
      lid.material = material;
    }
  });
}

export function animateFittedEye(eye: THREE.Group, side: string, weights: Record<string, number>, autoBlink: number, delta: number): void {
  const data = eye.userData.fittedEye as EyeData;
  const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.1) : 0;
  const horizontal = finiteWeight(weights["eyeLookIn" + side]) - finiteWeight(weights["eyeLookOut" + side]);
  const vertical = finiteWeight(weights["eyeLookUp" + side]) - finiteWeight(weights["eyeLookDown" + side]);
  // MediaPipe ring 0 is at negative X (subject right). In points toward the
  // nose; mirroring the right eye converts anatomical labels to shared gaze.
  const sign = data.center.x < 0 ? 1 : -1;
  const x = data.baseIris.x + horizontal * sign * data.width * 0.12;
  const y = data.baseIris.y + vertical * data.height * 0.12;
  data.iris.value.x = THREE.MathUtils.damp(data.iris.value.x, x, 12, dt);
  data.iris.value.y = THREE.MathUtils.damp(data.iris.value.y, y, 12, dt);
  const explicitBlink = weights["eyeBlink" + side] ?? weights.eyeBlink;
  // Explicit live/manual zero means open. Autonomous blinks only run when
  // no blink channel is supplied; squint remains an independent lid control.
  const target = Math.max(explicitBlink === undefined ? finiteWeight(autoBlink) : finiteWeight(explicitBlink), finiteWeight(weights["eyeSquint" + side]) * 0.42);
  const previous = finiteWeight(eye.userData.closure);
  const close = target >= 0.999 ? 1 : THREE.MathUtils.damp(previous, target, 36, dt);
  eye.userData.closure = close;
  const wide = finiteWeight(weights["eyeWide" + side]);
  if (Math.abs(close - previous) > 0.0001 || wide !== eye.userData.lastWide) deformFittedEye(eye, close, wide);
  eye.userData.lastWide = wide;
}

/** FLAME exports may include textured native eye surfaces. Open just the two
 * measured apertures in the head material instead of stacking a second eye
 * over that surface. Rest-space coordinates retain skinning/morph buffers.
 * Restrict Z so the mask never punches through the back of the skull.
 */
export function openFittedEyeApertures(root: THREE.Object3D, headMaterial: THREE.MeshStandardMaterial): void {
  const eyes: EyeData[] = [];
  root.traverse((object) => { if (object.userData.fittedEye) eyes.push(object.userData.fittedEye as EyeData); });
  if (eyes.length !== 2) return;
  const contours = eyes.flatMap((eye) => eye.columns.map((c) => new THREE.Vector4(c.x, c.upper.y, c.lower.y, (c.upper.z + c.lower.z) * 0.5)));
  headMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.fittedContours = { value: contours };
    shader.uniforms.fittedDepthRange = { value: new THREE.Vector2(eyes[0].width * 0.8, eyes[1].width * 0.8) };
    shader.vertexShader = "varying vec3 fittedHeadRest;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nfittedHeadRest = position;");
    shader.fragmentShader = "varying vec3 fittedHeadRest; uniform vec4 fittedContours[66]; uniform vec2 fittedDepthRange;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      for (int eye = 0; eye < 2; eye++) {
        int start = eye * 33;
        if (fittedHeadRest.x > fittedContours[start].x && fittedHeadRest.x < fittedContours[start + 32].x) {
          for (int col = 0; col < 32; col++) {
            vec4 a = fittedContours[start + col]; vec4 b = fittedContours[start + col + 1];
            if (fittedHeadRest.x >= a.x && fittedHeadRest.x <= b.x) {
              vec4 contour = mix(a, b, (fittedHeadRest.x - a.x) / max(b.x - a.x, 0.0000001));
              if (fittedHeadRest.y < contour.y && fittedHeadRest.y > contour.z && abs(fittedHeadRest.z - contour.w) < fittedDepthRange[eye]) discard;
            }
          }
        }
      }
    `);
  };
  headMaterial.customProgramCacheKey = () => "avatarace-fitted-apertures-v1";
  headMaterial.needsUpdate = true;
}