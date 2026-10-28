import { a as ARKIT_INDEX, i as ARKIT_BLENDSHAPE_NAMES, n as setPendingPhoto, r as setFaceCache } from "./routes-DsULcfk1.mjs";
import { t as Delaunator } from "../_libs/delaunator+robust-predicates.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/detect-GX8TkQO8.js
var OVAL = [
	10,
	338,
	297,
	332,
	284,
	251,
	389,
	356,
	454,
	323,
	361,
	288,
	397,
	365,
	379,
	378,
	400,
	377,
	152,
	148,
	176,
	149,
	150,
	136,
	172,
	58,
	132,
	93,
	234,
	127,
	162,
	21,
	54,
	103,
	67,
	109
];
var EYE_A = [
	33,
	7,
	163,
	144,
	145,
	153,
	154,
	155,
	133,
	173,
	157,
	158,
	159,
	160,
	161,
	246
];
var EYE_B = [
	263,
	249,
	390,
	373,
	374,
	380,
	381,
	382,
	362,
	398,
	384,
	385,
	386,
	387,
	388,
	466
];
var BROW_A = [
	70,
	63,
	105,
	66,
	107,
	55,
	65,
	52,
	53,
	46
];
var BROW_B = [
	300,
	293,
	334,
	296,
	336,
	285,
	295,
	282,
	283,
	276
];
var MOUTH = [
	61,
	185,
	40,
	39,
	37,
	0,
	267,
	269,
	270,
	409,
	291,
	375,
	321,
	314,
	17,
	84,
	181,
	91,
	146,
	78,
	95,
	88,
	178,
	87,
	14,
	317,
	402,
	318,
	324,
	308,
	415,
	310,
	311,
	312,
	13,
	82,
	81,
	80,
	191
];
var LOWER_LIP = [
	17,
	84,
	181,
	91,
	146,
	61,
	185,
	40,
	39,
	37,
	18,
	83,
	314,
	405,
	321,
	375,
	291,
	409,
	270,
	269,
	267
];
var UPPER_LIP = [
	13,
	312,
	311,
	310,
	415,
	308,
	324,
	318,
	402,
	317,
	14,
	87,
	178,
	88,
	95,
	78,
	191,
	80,
	81,
	82
];
var NOSE = [
	1,
	2,
	4,
	5,
	6,
	19,
	94,
	98,
	327,
	195,
	197,
	168
];
var JAW = [
	152,
	148,
	176,
	149,
	150,
	136,
	172,
	58,
	132,
	93,
	377,
	400,
	378,
	379,
	365,
	397,
	288,
	361,
	323
];
var CHEEK_A = [
	116,
	123,
	147,
	213,
	192,
	214,
	212,
	216,
	205
];
var CHEEK_B = [
	345,
	352,
	376,
	433,
	416,
	434,
	432,
	436,
	425
];
var IRIS_A = [
	468,
	469,
	470,
	471,
	472
];
var IRIS_B = [
	473,
	474,
	475,
	476,
	477
];
function buildFace(landmarks, categories, source, mode) {
	const indices = triangulate(landmarks);
	let positions = layout(landmarks, mode);
	if (mode === "detail") {
		positions = smoothPositions(positions, indices, 2);
		inflateCheeks(positions);
	}
	const uvs = makeUvs(landmarks);
	const texture = makeTexture(source, landmarks, mode === "detail" ? 1.12 : 1.05);
	const morphs = buildMorphs(positions, mode === "detail" ? 1.4 : 1);
	const influences = ARKIT_BLENDSHAPE_NAMES.map((name) => {
		return categories.find((row) => row.categoryName === name)?.score ?? 0;
	});
	return {
		positions,
		uvs,
		indices,
		morphs,
		influences,
		texture
	};
}
function layout(landmarks, mode) {
	const n = landmarks.length;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	for (const lm of landmarks) {
		cx += lm.x;
		cy += lm.y;
		cz += lm.z;
	}
	cx /= n;
	cy /= n;
	cz /= n;
	const zBoost = mode === "detail" ? 1.45 : 1.05;
	const raw = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		const lm = landmarks[i];
		raw[i * 3] = lm.x - cx;
		raw[i * 3 + 1] = -(lm.y - cy);
		raw[i * 3 + 2] = -(lm.z - cz) * zBoost;
	}
	let minX = Infinity;
	let maxX = -Infinity;
	for (let i = 0; i < n; i++) {
		minX = Math.min(minX, raw[i * 3]);
		maxX = Math.max(maxX, raw[i * 3]);
	}
	const scale = .19 / Math.max(1e-4, maxX - minX);
	for (let i = 0; i < raw.length; i++) raw[i] = (raw[i] ?? 0) * scale;
	return raw;
}
function triangulate(landmarks) {
	const coords = new Float32Array(landmarks.length * 2);
	for (let i = 0; i < landmarks.length; i++) {
		coords[i * 2] = landmarks[i].x;
		coords[i * 2 + 1] = landmarks[i].y;
	}
	const delaunay = new Delaunator(coords);
	const diag = faceDiag(landmarks);
	let indices = collect(delaunay.triangles, landmarks, diag * .28);
	if (indices.length < 300) indices = collect(delaunay.triangles, landmarks, diag * .55);
	return indices;
}
function collect(triangles, landmarks, maxEdge) {
	const out = [];
	for (let t = 0; t < triangles.length; t += 3) {
		const a = triangles[t];
		const b = triangles[t + 1];
		const c = triangles[t + 2];
		if (dist(landmarks[a], landmarks[b]) > maxEdge) continue;
		if (dist(landmarks[b], landmarks[c]) > maxEdge) continue;
		if (dist(landmarks[c], landmarks[a]) > maxEdge) continue;
		out.push(a, b, c);
	}
	return new Uint32Array(out);
}
function faceDiag(landmarks) {
	let minX = 1;
	let maxX = 0;
	let minY = 1;
	let maxY = 0;
	for (const lm of landmarks) {
		minX = Math.min(minX, lm.x);
		maxX = Math.max(maxX, lm.x);
		minY = Math.min(minY, lm.y);
		maxY = Math.max(maxY, lm.y);
	}
	return Math.hypot(maxX - minX, maxY - minY);
}
function dist(a, b) {
	if (!a || !b) return Infinity;
	return Math.hypot(a.x - b.x, a.y - b.y);
}
function cropOf(landmarks) {
	let minX = 1;
	let maxX = 0;
	let minY = 1;
	let maxY = 0;
	for (const lm of landmarks) {
		minX = Math.min(minX, lm.x);
		maxX = Math.max(maxX, lm.x);
		minY = Math.min(minY, lm.y);
		maxY = Math.max(maxY, lm.y);
	}
	const size = Math.max(maxX - minX, maxY - minY) * 1.35;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return {
		x: cx - size / 2,
		y: cy - size / 2,
		size
	};
}
function makeUvs(landmarks) {
	const crop = cropOf(landmarks);
	const uvs = new Float32Array(landmarks.length * 2);
	for (let i = 0; i < landmarks.length; i++) {
		const lm = landmarks[i];
		uvs[i * 2] = (lm.x - crop.x) / crop.size;
		uvs[i * 2 + 1] = 1 - (lm.y - crop.y) / crop.size;
	}
	return uvs;
}
function makeTexture(source, landmarks, contrast) {
	const size = 640;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	const crop = cropOf(landmarks);
	ctx.drawImage(source, crop.x * source.width, crop.y * source.height, crop.size * source.width, crop.size * source.height, 0, 0, size, size);
	const image = ctx.getImageData(0, 0, size, size);
	const data = image.data;
	for (let i = 0; i < data.length; i += 4) {
		data[i] = clampByte((data[i] - 128) * contrast + 128);
		data[i + 1] = clampByte((data[i + 1] - 128) * contrast + 128);
		data[i + 2] = clampByte((data[i + 2] - 128) * contrast + 128);
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}
function smoothPositions(pos, indices, iterations) {
	const count = pos.length / 3;
	const neighbors = Array.from({ length: count }, () => []);
	const seen = Array.from({ length: count }, () => /* @__PURE__ */ new Set());
	for (let t = 0; t < indices.length; t += 3) {
		const tri = [
			indices[t],
			indices[t + 1],
			indices[t + 2]
		];
		for (let k = 0; k < 3; k++) {
			const u = tri[k];
			const v = tri[(k + 1) % 3];
			if (u >= count || v >= count) continue;
			if (!seen[u].has(v)) {
				seen[u].add(v);
				neighbors[u].push(v);
			}
			if (!seen[v].has(u)) {
				seen[v].add(u);
				neighbors[v].push(u);
			}
		}
	}
	const pin = new Set(OVAL.filter((i) => i < count));
	let src = pos;
	for (let iter = 0; iter < iterations; iter++) {
		const dst = new Float32Array(src.length);
		for (let i = 0; i < count; i++) {
			const nbrs = neighbors[i] ?? [];
			if (pin.has(i) || nbrs.length === 0) {
				dst[i * 3] = src[i * 3] ?? 0;
				dst[i * 3 + 1] = src[i * 3 + 1] ?? 0;
				dst[i * 3 + 2] = src[i * 3 + 2] ?? 0;
				continue;
			}
			let ax = 0;
			let ay = 0;
			let az = 0;
			for (const j of nbrs) {
				ax += src[j * 3] ?? 0;
				ay += src[j * 3 + 1] ?? 0;
				az += src[j * 3 + 2] ?? 0;
			}
			const m = nbrs.length;
			const amount = .45;
			dst[i * 3] = (src[i * 3] ?? 0) * .55 + ax / m * amount;
			dst[i * 3 + 1] = (src[i * 3 + 1] ?? 0) * .55 + ay / m * amount;
			dst[i * 3 + 2] = (src[i * 3 + 2] ?? 0) * .55 + az / m * amount;
		}
		src = dst;
	}
	return src;
}
function inflateCheeks(pos) {
	const count = pos.length / 3;
	let minY = Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < count; i++) {
		const y = pos[i * 3 + 1] ?? 0;
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
	}
	for (let i = 0; i < count; i++) {
		const x = pos[i * 3] ?? 0;
		const y = pos[i * 3 + 1] ?? 0;
		const ax = Math.abs(x);
		const yn = (y - minY) / Math.max(.001, maxY - minY);
		if (ax > .025 && ax < .085 && yn > .25 && yn < .72) {
			const w = clamp(1 - Math.abs(ax - .05) / .04);
			pos[i * 3 + 2] = (pos[i * 3 + 2] ?? 0) + .012 * w;
		}
	}
}
function buildMorphs(pos, amp) {
	const morphs = ARKIT_BLENDSHAPE_NAMES.map(() => new Float32Array(pos.length));
	const put = (name, buf) => {
		morphs[ARKIT_INDEX[name]] = buf;
	};
	const eyes = byX(pos, EYE_A, EYE_B);
	const brows = byX(pos, BROW_A, BROW_B);
	const cheeks = byX(pos, CHEEK_A, CHEEK_B);
	const iris = byX(pos, IRIS_A, IRIS_B);
	const smileLeft = (pos[183] ?? 0) >= (pos[873] ?? 0) ? 61 : 291;
	const smileRight = smileLeft === 61 ? 291 : 61;
	put("jawOpen", jawOpen(pos, amp));
	put("jawForward", ids(pos, JAW, 0, 0, .018 * amp));
	put("jawLeft", ids(pos, JAW, .016 * amp, 0, 0));
	put("jawRight", ids(pos, JAW, -.016 * amp, 0, 0));
	put("mouthClose", lipClose(pos, amp));
	put("mouthFunnel", toward(pos, MOUTH, amp, .22, .016));
	put("mouthPucker", toward(pos, MOUTH, amp, .48, .01));
	put("mouthLeft", ids(pos, MOUTH, .012 * amp, 0, 0));
	put("mouthRight", ids(pos, MOUTH, -.012 * amp, 0, 0));
	put("mouthSmileLeft", corner(pos, smileLeft, amp, 1));
	put("mouthSmileRight", corner(pos, smileRight, amp, -1));
	put("mouthFrownLeft", corner(pos, smileLeft, amp * .7, .2, -1));
	put("mouthFrownRight", corner(pos, smileRight, amp * .7, -.2, -1));
	put("mouthDimpleLeft", corner(pos, smileLeft, amp * .45, 1, .2));
	put("mouthDimpleRight", corner(pos, smileRight, amp * .45, -1, .2));
	put("mouthStretchLeft", corner(pos, smileLeft, amp * .8, 1.4, -.35));
	put("mouthStretchRight", corner(pos, smileRight, amp * .8, -1.4, -.35));
	put("mouthRollLower", ids(pos, LOWER_LIP, 0, .008 * amp, -.008 * amp));
	put("mouthRollUpper", ids(pos, UPPER_LIP, 0, -.008 * amp, -.008 * amp));
	put("mouthShrugLower", ids(pos, LOWER_LIP, 0, .012 * amp, .006 * amp));
	put("mouthShrugUpper", ids(pos, UPPER_LIP, 0, .008 * amp, .008 * amp));
	put("mouthPressLeft", corner(pos, smileLeft, amp * .5, .3, -.2));
	put("mouthPressRight", corner(pos, smileRight, amp * .5, -.3, -.2));
	put("mouthLowerDownLeft", corner(pos, smileLeft, amp * .55, .1, -1));
	put("mouthLowerDownRight", corner(pos, smileRight, amp * .55, -.1, -1));
	put("mouthUpperUpLeft", ids(pos, UPPER_LIP, 0, .012 * amp, .004 * amp));
	put("mouthUpperUpRight", ids(pos, UPPER_LIP, 0, .012 * amp, .004 * amp));
	put("eyeBlinkLeft", blink(pos, eyes.high, amp, -1));
	put("eyeBlinkRight", blink(pos, eyes.low, amp, -1));
	put("eyeWideLeft", blink(pos, eyes.high, amp, 1));
	put("eyeWideRight", blink(pos, eyes.low, amp, 1));
	put("eyeSquintLeft", blink(pos, eyes.high, amp * .45, -1));
	put("eyeSquintRight", blink(pos, eyes.low, amp * .45, -1));
	put("eyeLookUpLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, .008 * amp, 0));
	put("eyeLookDownLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, -.008 * amp, 0));
	put("eyeLookInLeft", ids(pos, iris.high.length ? iris.high : eyes.high, -.006 * amp, 0, 0));
	put("eyeLookOutLeft", ids(pos, iris.high.length ? iris.high : eyes.high, .006 * amp, 0, 0));
	put("eyeLookUpRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, .008 * amp, 0));
	put("eyeLookDownRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, -.008 * amp, 0));
	put("eyeLookInRight", ids(pos, iris.low.length ? iris.low : eyes.low, .006 * amp, 0, 0));
	put("eyeLookOutRight", ids(pos, iris.low.length ? iris.low : eyes.low, -.006 * amp, 0, 0));
	put("browDownLeft", ids(pos, brows.high, 0, -.012 * amp, 0));
	put("browDownRight", ids(pos, brows.low, 0, -.012 * amp, 0));
	put("browInnerUp", browInner(pos, [...brows.high, ...brows.low], amp));
	put("browOuterUpLeft", browOuter(pos, brows.high, amp));
	put("browOuterUpRight", browOuter(pos, brows.low, amp));
	put("cheekPuff", cheeksOut(pos, cheeks, amp));
	put("cheekSquintLeft", ids(pos, cheeks.high, 0, .008 * amp, .006 * amp));
	put("cheekSquintRight", ids(pos, cheeks.low, 0, .008 * amp, .006 * amp));
	put("noseSneerLeft", ids(pos, NOSE, .004 * amp, .008 * amp, 0));
	put("noseSneerRight", ids(pos, NOSE, -.004 * amp, .008 * amp, 0));
	put("tongueOut", ids(pos, [
		13,
		14,
		17
	], 0, -.01 * amp, .02 * amp));
	return morphs;
}
function jawOpen(pos, amp) {
	const buf = new Float32Array(pos.length);
	const lip = avgY(pos, [
		13,
		14,
		17,
		0
	]);
	const chin = pos[457] ?? lip - .05;
	const span = Math.max(.01, lip - chin);
	for (let i = 0; i < pos.length / 3; i++) {
		const y = pos[i * 3 + 1] ?? 0;
		if (y >= lip) continue;
		const t = clamp((lip - y) / span);
		buf[i * 3 + 1] = -.05 * amp * t * t;
		buf[i * 3 + 2] = .012 * amp * t * t;
	}
	return buf;
}
function lipClose(pos, amp) {
	const buf = new Float32Array(pos.length);
	add(buf, pos, LOWER_LIP, 0, .012 * amp, 0);
	add(buf, pos, UPPER_LIP, 0, -.008 * amp, 0);
	return buf;
}
function corner(pos, index, amp, outward, up = 1) {
	const buf = new Float32Array(pos.length);
	const o = index * 3;
	if (o + 2 >= pos.length) return buf;
	const cx = pos[o] ?? 0;
	const cy = pos[o + 1] ?? 0;
	const cz = pos[o + 2] ?? 0;
	for (let i = 0; i < pos.length / 3; i++) {
		const d = Math.hypot((pos[i * 3] ?? 0) - cx, (pos[i * 3 + 1] ?? 0) - cy, (pos[i * 3 + 2] ?? 0) - cz);
		const w = Math.max(0, 1 - d / .05);
		if (w === 0) continue;
		const e = w * w;
		buf[i * 3] = outward * .014 * amp * e;
		buf[i * 3 + 1] = up * .02 * amp * e;
		buf[i * 3 + 2] = .005 * amp * e;
	}
	return buf;
}
function blink(pos, eye, amp, dir) {
	const buf = new Float32Array(pos.length);
	let cy = 0;
	let c = 0;
	for (const i of eye) {
		if (i * 3 + 1 >= pos.length) continue;
		cy += pos[i * 3 + 1] ?? 0;
		c++;
	}
	if (!c) return buf;
	cy /= c;
	for (const i of eye) {
		const o = i * 3;
		if (o + 1 >= pos.length) continue;
		const sign = (pos[o + 1] ?? 0) >= cy ? dir : dir * -.25;
		buf[o + 1] = sign * .012 * amp;
	}
	return buf;
}
function toward(pos, group, amp, pull, z) {
	const buf = new Float32Array(pos.length);
	let cx = 0;
	let cy = 0;
	let c = 0;
	for (const i of group) {
		if (i * 3 + 2 >= pos.length) continue;
		cx += pos[i * 3] ?? 0;
		cy += pos[i * 3 + 1] ?? 0;
		c++;
	}
	if (!c) return buf;
	cx /= c;
	cy /= c;
	for (const i of group) {
		const o = i * 3;
		if (o + 2 >= pos.length) continue;
		buf[o] = (cx - (pos[o] ?? 0)) * pull * amp;
		buf[o + 1] = (cy - (pos[o + 1] ?? 0)) * pull * amp;
		buf[o + 2] = z * amp;
	}
	return buf;
}
function browInner(pos, group, amp) {
	const buf = new Float32Array(pos.length);
	for (const i of group) {
		const o = i * 3;
		if (o + 1 >= pos.length) continue;
		const w = clamp(1 - Math.abs(pos[o] ?? 0) / .05);
		buf[o + 1] = .016 * amp * w;
	}
	return buf;
}
function browOuter(pos, group, amp) {
	const buf = new Float32Array(pos.length);
	for (const i of group) {
		const o = i * 3;
		if (o + 1 >= pos.length) continue;
		const w = clamp((Math.abs(pos[o] ?? 0) - .02) / .05);
		buf[o + 1] = .014 * amp * w;
	}
	return buf;
}
function cheeksOut(pos, cheeks, amp) {
	const buf = new Float32Array(pos.length);
	add(buf, pos, cheeks.high, .012 * amp, 0, .01 * amp);
	add(buf, pos, cheeks.low, -.012 * amp, 0, .01 * amp);
	return buf;
}
function ids(pos, group, dx, dy, dz) {
	const buf = new Float32Array(pos.length);
	add(buf, pos, group, dx, dy, dz);
	return buf;
}
function add(buf, pos, group, dx, dy, dz) {
	for (const i of group) {
		const o = i * 3;
		if (o + 2 >= pos.length) continue;
		buf[o] = (buf[o] ?? 0) + dx;
		buf[o + 1] = (buf[o + 1] ?? 0) + dy;
		buf[o + 2] = (buf[o + 2] ?? 0) + dz;
	}
}
function byX(pos, a, b) {
	return meanX(pos, a) >= meanX(pos, b) ? {
		high: a,
		low: b
	} : {
		high: b,
		low: a
	};
}
function meanX(pos, group) {
	let s = 0;
	let c = 0;
	for (const i of group) {
		if (i * 3 >= pos.length) continue;
		s += pos[i * 3] ?? 0;
		c++;
	}
	return c ? s / c : 0;
}
function avgY(pos, group) {
	let s = 0;
	let c = 0;
	for (const i of group) {
		if (i * 3 + 1 >= pos.length) continue;
		s += pos[i * 3 + 1] ?? 0;
		c++;
	}
	return c ? s / c : 0;
}
function clamp(v) {
	return Math.max(0, Math.min(1, v));
}
function clampByte(v) {
	return Math.max(0, Math.min(255, v));
}
var landmarkerPromise = null;
var usingGpu = true;
async function createLandmarker(gpu) {
	const { FaceLandmarker, FilesetResolver } = await import("../_libs/mediapipe__tasks-vision.mjs").then((n) => n.t);
	const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
	return await FaceLandmarker.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath: "/mediapipe/face_landmarker.task",
			delegate: gpu ? "GPU" : "CPU"
		},
		runningMode: "IMAGE",
		numFaces: 1,
		outputFaceBlendshapes: true
	});
}
function loadLandmarker() {
	if (!landmarkerPromise) landmarkerPromise = createLandmarker(true).catch(async () => {
		usingGpu = false;
		return createLandmarker(false);
	});
	return landmarkerPromise;
}
async function prepareAndDetect(file, onStatus) {
	onStatus?.("Finding your face…");
	const canvas = await fileToCanvas(file, 1024);
	setPendingPhoto(downscale(canvas, 768, .84));
	const preview = downscale(canvas, 360, .82);
	await detectCanvas(canvas, onStatus);
	return preview;
}
async function detectCanvas(canvas, onStatus) {
	let landmarker = await loadLandmarker();
	let result;
	try {
		result = landmarker.detect(canvas);
	} catch (error) {
		if (!usingGpu) throw error;
		usingGpu = false;
		landmarkerPromise = createLandmarker(false);
		landmarker = await landmarkerPromise;
		result = landmarker.detect(canvas);
	}
	const raw = result.faceLandmarks?.[0];
	if (!raw || raw.length < 100) throw new Error("NO_FACE");
	onStatus?.("Building both versions…");
	const landmarks = raw.map((lm) => ({
		x: lm.x,
		y: lm.y,
		z: lm.z ?? 0
	}));
	const categories = result.faceBlendshapes?.[0]?.categories ?? [];
	const standard = buildFace(landmarks, categories, canvas, "standard");
	const detail = buildFace(landmarks, categories, canvas, "detail");
	setFaceCache({
		standard,
		detail
	});
}
async function fileToCanvas(file, max) {
	const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("NO_CANVAS");
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return canvas;
}
function downscale(source, max, quality) {
	const scale = Math.min(1, max / Math.max(source.width, source.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(source.width * scale));
	canvas.height = Math.max(1, Math.round(source.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";
	ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/jpeg", quality);
}
//#endregion
export { prepareAndDetect };
