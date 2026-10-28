import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { a as VOICES, i as SKINS, n as HAIR, o as labelOf, r as OUTFITS, t as BODIES } from "./constants-BO4bJ6T1.mjs";
import { a as Smile, c as RotateCcw, d as Download, f as ChevronLeft, h as AudioLines, i as Square, l as Mic, m as Camera, o as Shirt, p as Check, r as Trash2, s as Save, t as UserRound, u as ImagePlus } from "../_libs/lucide-react.mjs";
import { t as create } from "../_libs/zustand.mjs";
import { C as Texture, S as SphereGeometry, _ as MeshBasicMaterial, a as BufferGeometry, b as SRGBColorSpace, c as CircleGeometry, d as CylinderGeometry, f as DirectionalLight, g as Mesh, h as LatheGeometry, i as BufferAttribute, l as Color, m as HemisphereLight, n as WebGLRenderer, o as CanvasTexture, p as Group, r as BoxGeometry, s as CapsuleGeometry, t as GLTFExporter, u as ConeGeometry, v as MeshStandardMaterial, w as Vector2, x as Scene, y as PerspectiveCamera } from "../_libs/three.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DsULcfk1.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
/** Canonical ARKit 52 names. NVIDIA Audio2Face and VSeeFace write these same weights. */
var ARKIT_BLENDSHAPE_NAMES = [
	"eyeBlinkLeft",
	"eyeLookDownLeft",
	"eyeLookInLeft",
	"eyeLookOutLeft",
	"eyeLookUpLeft",
	"eyeSquintLeft",
	"eyeWideLeft",
	"eyeBlinkRight",
	"eyeLookDownRight",
	"eyeLookInRight",
	"eyeLookOutRight",
	"eyeLookUpRight",
	"eyeSquintRight",
	"eyeWideRight",
	"jawForward",
	"jawLeft",
	"jawRight",
	"jawOpen",
	"mouthClose",
	"mouthFunnel",
	"mouthPucker",
	"mouthRight",
	"mouthLeft",
	"mouthSmileLeft",
	"mouthSmileRight",
	"mouthFrownLeft",
	"mouthFrownRight",
	"mouthDimpleLeft",
	"mouthDimpleRight",
	"mouthStretchLeft",
	"mouthStretchRight",
	"mouthRollLower",
	"mouthRollUpper",
	"mouthShrugLower",
	"mouthShrugUpper",
	"mouthPressLeft",
	"mouthPressRight",
	"mouthLowerDownLeft",
	"mouthLowerDownRight",
	"mouthUpperUpLeft",
	"mouthUpperUpRight",
	"browDownLeft",
	"browDownRight",
	"browInnerUp",
	"browOuterUpLeft",
	"browOuterUpRight",
	"cheekPuff",
	"cheekSquintLeft",
	"cheekSquintRight",
	"noseSneerLeft",
	"noseSneerRight",
	"tongueOut"
];
var ARKIT_INDEX = Object.fromEntries(ARKIT_BLENDSHAPE_NAMES.map((name, index) => [name, index]));
var PRESETS = {
	smile: {
		mouthSmileLeft: .85,
		mouthSmileRight: .85,
		eyeSquintLeft: .35,
		eyeSquintRight: .35,
		cheekSquintLeft: .3,
		cheekSquintRight: .3
	},
	blink: {
		eyeBlinkLeft: 1,
		eyeBlinkRight: 1
	},
	wow: {
		jawOpen: .65,
		eyeWideLeft: .75,
		eyeWideRight: .75,
		browInnerUp: .55,
		browOuterUpLeft: .35,
		browOuterUpRight: .35
	}
};
var cache = null;
function getFaceCache() {
	return cache;
}
function setFaceCache(next) {
	cache = next;
}
var DB = "streamweaver";
var STORE = "avatars";
var pendingPhoto = null;
function setPendingPhoto(url) {
	pendingPhoto = url;
}
function getPendingPhoto() {
	return pendingPhoto;
}
function openDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? /* @__PURE__ */ new Error("Could not open saves"));
	});
}
async function listAvatars() {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
		req.onsuccess = () => {
			resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
		};
		req.onerror = () => reject(req.error ?? /* @__PURE__ */ new Error("Could not read saves"));
	});
}
async function saveAvatar(entry) {
	const db = await openDb();
	const doomed = (await listAvatars()).slice(7);
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		const store = tx.objectStore(STORE);
		for (const row of doomed) store.delete(row.id);
		store.put(entry);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? /* @__PURE__ */ new Error("Could not save"));
	});
}
async function deleteAvatar(id) {
	const db = await openDb();
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		tx.objectStore(STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? /* @__PURE__ */ new Error("Could not delete"));
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var ALLOWED = new Set(VOICES.map((voice) => voice.id));
var speakLine = createServerFn({ method: "POST" }).validator((input) => {
	const raw = input ?? {};
	return {
		text: typeof raw.text === "string" ? raw.text.trim().slice(0, 280) : "",
		voiceId: typeof raw.voiceId === "string" && ALLOWED.has(raw.voiceId) ? raw.voiceId : "eve"
	};
}).handler(createSsrRpc("c25fd90b0ae090a799d848351f5abcc83d53cee2dc6f8ba505f67166e3792632"));
/**
* Phone-side Sound2Face.
* Audio in, ARKit 52 weights out, updated every frame while sound plays.
* NVIDIA Audio2Face writes this same weight vector; this solver is the
* on-device stand-in (energy + spectral bands), not their GPU model.
*/
var Sound2Face = class {
	ctx = null;
	analyser = null;
	freq = /* @__PURE__ */ new Uint8Array(0);
	time = /* @__PURE__ */ new Uint8Array(0);
	source = null;
	stream = null;
	mode = "idle";
	scripted = null;
	smooth = ARKIT_BLENDSHAPE_NAMES.map(() => 0);
	onEnd = null;
	unlock() {
		this.ensure().resume();
	}
	async play(buffer) {
		this.stopTracks();
		const ctx = this.ensure();
		await ctx.resume();
		const audio = await ctx.decodeAudioData(buffer.slice(0));
		const src = ctx.createBufferSource();
		src.buffer = audio;
		const analyser = this.ensureAnalyser();
		analyser.disconnect();
		src.connect(analyser);
		analyser.connect(ctx.destination);
		src.onended = () => {
			if (this.source !== src) return;
			this.source = null;
			this.mode = "idle";
			this.onEnd?.();
		};
		this.source = src;
		this.scripted = null;
		this.mode = "audio";
		src.start();
	}
	async startMic() {
		this.stopTracks();
		this.unlock();
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true
			},
			video: false
		});
		const ctx = this.ensure();
		await ctx.resume();
		const node = ctx.createMediaStreamSource(stream);
		const analyser = this.ensureAnalyser();
		analyser.disconnect();
		node.connect(analyser);
		this.stream = stream;
		this.scripted = null;
		this.mode = "audio";
	}
	setScripted(weights) {
		this.scripted = weights;
		if (!weights) this.mode = this.stream || this.source ? "audio" : "idle";
	}
	/** Latest ARKit weights, or null when nothing is driving the face. */
	sample() {
		if (this.scripted) return this.follow(this.scripted);
		if (this.mode !== "audio" || !this.analyser || !this.ctx) return null;
		this.analyser.getByteFrequencyData(this.freq);
		this.analyser.getByteTimeDomainData(this.time);
		return this.follow(weightsFromSpectrum(this.freq, this.time, this.ctx.sampleRate, this.analyser.fftSize));
	}
	stop() {
		this.stopTracks();
		this.scripted = null;
		this.mode = "idle";
		if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
	}
	dispose() {
		this.stop();
		this.ctx?.close();
		this.ctx = null;
		this.analyser = null;
	}
	stopTracks() {
		if (this.source) {
			const src = this.source;
			this.source = null;
			try {
				src.stop();
			} catch {}
		}
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.mode = "idle";
	}
	ensure() {
		if (!this.ctx) {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			this.ctx = new Ctx();
		}
		return this.ctx;
	}
	ensureAnalyser() {
		const ctx = this.ensure();
		if (!this.analyser) {
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = .25;
			this.analyser = analyser;
			this.freq = new Uint8Array(analyser.frequencyBinCount);
			this.time = new Uint8Array(analyser.fftSize);
		}
		return this.analyser;
	}
	follow(target) {
		const out = {};
		const k = .58;
		ARKIT_BLENDSHAPE_NAMES.forEach((name, index) => {
			const next = target[name] ?? 0;
			const value = this.smooth[index] + (next - this.smooth[index]) * k;
			this.smooth[index] = value;
			if (value > .012) out[name] = value;
		});
		return out;
	}
};
function weightsFromSpectrum(freq, time, sampleRate, fftSize) {
	const binHz = sampleRate / fftSize;
	const band = (lo, hi) => {
		const a = Math.max(0, Math.floor(lo / binHz));
		const b = Math.min(freq.length - 1, Math.ceil(hi / binHz));
		let sum = 0;
		let n = 0;
		for (let i = a; i <= b; i++) {
			sum += freq[i] ?? 0;
			n++;
		}
		return n ? sum / (n * 255) : 0;
	};
	let rms = 0;
	for (let i = 0; i < time.length; i++) {
		const v = ((time[i] ?? 128) - 128) / 128;
		rms += v * v;
	}
	rms = Math.sqrt(rms / Math.max(1, time.length));
	const energy = clamp$1(rms * 5.5);
	if (energy < .035) return {
		mouthClose: .4,
		jawOpen: .02
	};
	const low = band(150, 500);
	const mid = band(500, 1700);
	const high = band(1700, 4500);
	const open = clamp$1(energy * .55 + low * 1.15);
	const rounded = clamp$1(mid - high * .55);
	const spread = clamp$1(high * 1.05 + mid * .12);
	return {
		jawOpen: open * .92,
		jawForward: open * .12,
		mouthFunnel: rounded * .55,
		mouthPucker: clamp$1(rounded - spread * .4) * .45,
		mouthSmileLeft: spread * .4,
		mouthSmileRight: spread * .4,
		mouthStretchLeft: spread * .26,
		mouthStretchRight: spread * .26,
		cheekSquintLeft: spread * .18,
		cheekSquintRight: spread * .18,
		mouthClose: clamp$1(.25 - open),
		browInnerUp: energy * .12
	};
}
/** Syllable pulses for the on-device voice, which we cannot tap with an analyser. */
function scriptWeights(t) {
	const syllable = Math.max(0, Math.sin(t * Math.PI * 14));
	const round = Math.sin(t * Math.PI * 5.5) * .5 + .5;
	const open = syllable * .8;
	return {
		jawOpen: open,
		mouthFunnel: open * round * .5,
		mouthPucker: open * round * .28,
		mouthSmileLeft: open * (1 - round) * .32,
		mouthSmileRight: open * (1 - round) * .32
	};
}
function clamp$1(v) {
	return Math.max(0, Math.min(1, v));
}
var useStudio = create((set) => ({
	screen: "home",
	panel: "body",
	body: "balanced",
	outfit: "hoodie",
	hair: "short",
	skin: "sand",
	faceChoice: "standard",
	preset: "captured",
	headScale: 1.05,
	headY: .01,
	headZ: .02,
	expression: 1,
	status: "idle",
	statusText: "",
	error: null,
	hasFace: false,
	faceRev: 0,
	photoPreview: null,
	talk: "off",
	talkNote: null,
	line: "Hey, I'm ready when you are.",
	voiceId: "eve",
	patch: (partial) => set(partial)
}));
var SKIN = {
	porcelain: "#f2d3c4",
	sand: "#e0b08a",
	amber: "#c68642",
	bronze: "#8d5524",
	deep: "#4b2e1f"
};
var SPECS = {
	slim: {
		shoulder: .16,
		waist: .11,
		hip: .135,
		arm: .038,
		leg: .052
	},
	balanced: {
		shoulder: .19,
		waist: .135,
		hip: .16,
		arm: .046,
		leg: .06
	},
	athletic: {
		shoulder: .23,
		waist: .15,
		hip: .165,
		arm: .056,
		leg: .064
	},
	solid: {
		shoulder: .21,
		waist: .175,
		hip: .2,
		arm: .052,
		leg: .072
	}
};
var CLOTH = {
	tee: "#f4efe6",
	hoodie: "#1f6f66",
	jacket: "#2a313a",
	dress: "#e0943a",
	layers: "#243028"
};
function buildCharacter(options) {
	const spec = SPECS[options.body];
	const geometries = [];
	const materials = [];
	const skinMat = new MeshStandardMaterial({
		color: SKIN[options.skin],
		roughness: .62,
		metalness: .02
	});
	const clothMat = new MeshStandardMaterial({
		color: CLOTH[options.outfit],
		roughness: .72,
		metalness: .04
	});
	const hairMat = new MeshStandardMaterial({
		color: "#1c140f",
		roughness: .8,
		metalness: .02
	});
	const accent = new MeshStandardMaterial({
		color: "#f0a202",
		roughness: .45,
		metalness: .08
	});
	const paper = new MeshStandardMaterial({
		color: "#f4efe6",
		roughness: .75,
		metalness: .02
	});
	materials.push(skinMat, clothMat, hairMat, accent, paper);
	const geo = (g) => {
		geometries.push(g);
		return g;
	};
	const root = new Group();
	root.name = "Avatar";
	const legCyl = .58;
	const legGeo = geo(new CapsuleGeometry(spec.leg, legCyl, 4, 12));
	const legTotal = legCyl + spec.leg * 2;
	const hipY = legTotal * .9;
	for (const side of [-1, 1]) {
		const leg = new Mesh(legGeo, skinMat);
		leg.name = "Body";
		leg.position.set(side * spec.hip * .38, legTotal / 2, 0);
		leg.castShadow = false;
		root.add(leg);
		const foot = new Mesh(geo(new SphereGeometry(spec.leg * 1.15, 16, 12)), skinMat);
		foot.scale.set(1.15, .45, 1.7);
		foot.position.set(side * spec.hip * .38, spec.leg * .35, .03);
		root.add(foot);
	}
	const torsoH = .5;
	const torso = new Mesh(geo(torsoGeometry(spec, torsoH)), skinMat);
	torso.name = "Body";
	torso.position.y = hipY;
	root.add(torso);
	const shoulderY = hipY + torsoH * .82;
	const armCyl = .4;
	const armGeo = geo(new CapsuleGeometry(spec.arm, armCyl, 4, 10));
	const armTotal = armCyl + spec.arm * 2;
	for (const side of [-1, 1]) {
		const arm = new Mesh(armGeo, skinMat);
		arm.name = "Body";
		arm.position.set(side * (spec.shoulder + spec.arm * .25), shoulderY - armTotal / 2 + spec.arm, 0);
		root.add(arm);
		const hand = new Mesh(geo(new SphereGeometry(spec.arm * 1.15, 14, 10)), skinMat);
		hand.position.set(side * (spec.shoulder + spec.arm * .25), shoulderY - armTotal + spec.arm, 0);
		root.add(hand);
	}
	const neck = new Mesh(geo(new CylinderGeometry(.042, .05, .09, 16)), skinMat);
	neck.position.y = shoulderY + .06;
	root.add(neck);
	const head = new Group();
	head.name = "HeadAnchor";
	head.position.set(0, shoulderY + .2, 0);
	root.add(head);
	const cranium = new Mesh(geo(new SphereGeometry(.118, 32, 24)), skinMat);
	cranium.name = "Cranium";
	cranium.scale.set(.92, 1.06, .78);
	cranium.position.z = -.012;
	head.add(cranium);
	const earGeo = geo(new SphereGeometry(.022, 12, 10));
	for (const side of [-1, 1]) {
		const ear = new Mesh(earGeo, skinMat);
		ear.position.set(side * .108, -.008, -.01);
		ear.scale.set(.55, 1, .7);
		head.add(ear);
	}
	addOutfit(head, root, options.outfit, spec, torsoH, hipY, geo, clothMat, accent, paper);
	addHair(head, options.hair, geo, hairMat);
	addProxyFace(head, geo, materials);
	root.userData.geometries = geometries;
	root.userData.materials = materials;
	return root;
}
function torsoGeometry(spec, h) {
	const pts = [
		new Vector2(spec.hip * .72, 0),
		new Vector2(spec.hip, h * .14),
		new Vector2(spec.waist, h * .42),
		new Vector2(spec.waist * 1.04, h * .58),
		new Vector2(spec.shoulder * .92, h * .82),
		new Vector2(spec.shoulder * .55, h * .95),
		new Vector2(.05, h)
	];
	return new LatheGeometry(pts, 28);
}
function addOutfit(head, root, outfit, spec, torsoH, hipY, geo, clothMat, accent, paper) {
	if (outfit === "tee" || outfit === "layers") {
		const tee = new Mesh(geo(torsoGeometry({
			...spec,
			hip: spec.hip * 1.04,
			waist: spec.waist * 1.06,
			shoulder: spec.shoulder * 1.04
		}, torsoH * .78)), outfit === "tee" ? clothMat : paper);
		tee.name = "Outfit";
		tee.position.y = hipY + torsoH * .16;
		root.add(tee);
	}
	if (outfit === "hoodie" || outfit === "jacket" || outfit === "layers") {
		const shell = new Mesh(geo(torsoGeometry({
			...spec,
			hip: spec.hip * 1.08,
			waist: spec.waist * 1.1,
			shoulder: spec.shoulder * 1.08
		}, outfit === "layers" ? torsoH * .7 : torsoH * .92)), clothMat);
		shell.name = "Outfit";
		shell.position.y = hipY + (outfit === "layers" ? torsoH * .22 : torsoH * .06);
		root.add(shell);
	}
	if (outfit === "hoodie") {
		const hood = new Mesh(geo(new SphereGeometry(.132, 24, 16, 0, Math.PI * 2, .15, Math.PI * .72)), clothMat);
		hood.name = "Outfit";
		hood.scale.set(1.02, 1.05, .82);
		hood.position.set(0, .02, -.04);
		head.add(hood);
	}
	if (outfit === "jacket") {
		const stripe = new Mesh(geo(new BoxGeometry(.012, torsoH * .62, .01)), accent);
		stripe.position.set(0, hipY + torsoH * .42, spec.waist + .02);
		root.add(stripe);
	}
	if (outfit === "dress") {
		const bodice = new Mesh(geo(torsoGeometry({
			...spec,
			hip: spec.hip * 1.02,
			waist: spec.waist * 1.02,
			shoulder: spec.shoulder
		}, torsoH * .62)), clothMat);
		bodice.name = "Outfit";
		bodice.position.y = hipY + torsoH * .28;
		root.add(bodice);
		const skirt = new Mesh(geo(new ConeGeometry(spec.hip * 1.55, .46, 28, 1, true)), clothMat);
		skirt.name = "Outfit";
		skirt.position.y = hipY - .08;
		root.add(skirt);
	}
}
function addHair(head, hair, geo, hairMat) {
	if (hair === "none") return;
	const cap = new Mesh(geo(new SphereGeometry(.122, 24, 16, 0, Math.PI * 2, 0, Math.PI * .52)), hairMat);
	cap.name = "Hair";
	cap.scale.set(1.02, .78, 1.02);
	cap.position.y = .05;
	head.add(cap);
	if (hair === "long") {
		const back = new Mesh(geo(new CapsuleGeometry(.07, .26, 4, 10)), hairMat);
		back.name = "Hair";
		back.position.set(0, -.12, -.07);
		head.add(back);
	}
}
function addProxyFace(head, geo, materials) {
	const white = new MeshStandardMaterial({
		color: "#f7f3ee",
		roughness: .35
	});
	const dark = new MeshStandardMaterial({
		color: "#1a1612",
		roughness: .45
	});
	materials.push(white, dark);
	const eyeGeo = geo(new SphereGeometry(.018, 16, 12));
	const pupilGeo = geo(new SphereGeometry(.008, 12, 8));
	for (const side of [-1, 1]) {
		const group = new Group();
		group.name = side < 0 ? "ProxyEyeL" : "ProxyEyeR";
		const ball = new Mesh(eyeGeo, white);
		const pupil = new Mesh(pupilGeo, dark);
		pupil.position.z = .012;
		group.add(ball, pupil);
		group.position.set(side * .038, .018, .09);
		head.add(group);
	}
	const mouth = new Mesh(geo(new SphereGeometry(.028, 16, 12)), dark);
	mouth.name = "ProxyMouth";
	mouth.scale.set(1.25, .22, .45);
	mouth.position.set(0, -.045, .098);
	head.add(mouth);
}
function disposeCharacter(root) {
	const geometries = root.userData.geometries;
	const materials = root.userData.materials;
	geometries?.forEach((geometry) => geometry.dispose());
	materials?.forEach((material) => material.dispose());
	root.traverse((obj) => {
		const mesh = obj;
		if (!mesh.isMesh) return;
		mesh.geometry?.dispose();
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const mat of mats) {
			if (mat && "map" in mat && mat.map instanceof Texture) mat.map.dispose();
			mat?.dispose();
		}
	});
}
var DRIVEN = /* @__PURE__ */ new Set([
	"jawForward",
	"jawLeft",
	"jawRight",
	"jawOpen",
	"mouthClose",
	"mouthFunnel",
	"mouthPucker",
	"mouthRight",
	"mouthLeft",
	"mouthSmileLeft",
	"mouthSmileRight",
	"mouthFrownLeft",
	"mouthFrownRight",
	"mouthDimpleLeft",
	"mouthDimpleRight",
	"mouthStretchLeft",
	"mouthStretchRight",
	"mouthRollLower",
	"mouthRollUpper",
	"mouthShrugLower",
	"mouthShrugUpper",
	"mouthPressLeft",
	"mouthPressRight",
	"mouthLowerDownLeft",
	"mouthLowerDownRight",
	"mouthUpperUpLeft",
	"mouthUpperUpRight",
	"cheekPuff",
	"cheekSquintLeft",
	"cheekSquintRight",
	"tongueOut",
	"browInnerUp"
]);
var Viewport = (0, import_react.forwardRef)(function Viewport(props, ref) {
	const wrapRef = (0, import_react.useRef)(null);
	const propsRef = (0, import_react.useRef)(props);
	propsRef.current = props;
	const sceneRef = (0, import_react.useRef)(null);
	const characterRef = (0, import_react.useRef)(null);
	const faceRef = (0, import_react.useRef)(null);
	const rendererRef = (0, import_react.useRef)(null);
	const [booted, setBooted] = (0, import_react.useState)(0);
	(0, import_react.useImperativeHandle)(ref, () => ({
		snapshot: () => {
			try {
				return rendererRef.current?.domElement.toDataURL("image/jpeg", .72) ?? "";
			} catch {
				return "";
			}
		},
		exportGlb: () => exportGroup(characterRef.current)
	}));
	(0, import_react.useEffect)(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		const canvas = document.createElement("canvas");
		canvas.className = "h-full w-full touch-none";
		wrap.appendChild(canvas);
		const renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			preserveDrawingBuffer: true
		});
		renderer.outputColorSpace = SRGBColorSpace;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
		renderer.setClearColor(1514531, 1);
		rendererRef.current = renderer;
		const scene = new Scene();
		scene.background = new Color(1514531);
		sceneRef.current = scene;
		const camera = new PerspectiveCamera(30, 1, .05, 20);
		scene.add(new HemisphereLight(16774373, 1711912, .9));
		const key = new DirectionalLight(16773590, 2.2);
		key.position.set(1.1, 2.5, 1.8);
		scene.add(key);
		const rim = new DirectionalLight(8376516, .85);
		rim.position.set(-1.5, 1.5, -1.3);
		scene.add(rim);
		const warm = new DirectionalLight(15770114, .22);
		warm.position.set(-.4, 1.1, 2.2);
		scene.add(warm);
		const ground = new Mesh(new CircleGeometry(.62, 40), new MeshBasicMaterial({
			color: 0,
			transparent: true,
			opacity: .28
		}));
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = .002;
		scene.add(ground);
		let yaw = .2;
		let pitch = 1.18;
		let radius = 2.15;
		const pointers = /* @__PURE__ */ new Map();
		let lastPinch = 0;
		let lastX = 0;
		let lastY = 0;
		const placeCamera = () => {
			camera.position.set(Math.sin(pitch) * Math.sin(yaw) * radius, 1.02 + Math.cos(pitch) * radius, Math.sin(pitch) * Math.cos(yaw) * radius);
			camera.lookAt(0, 1.02, 0);
		};
		placeCamera();
		const onDown = (event) => {
			canvas.setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			lastX = event.clientX;
			lastY = event.clientY;
			lastPinch = 0;
		};
		const onMove = (event) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			if (pointers.size >= 2) {
				const [a, b] = [...pointers.values()];
				if (!a || !b) return;
				const dist = Math.hypot(a.x - b.x, a.y - b.y);
				if (lastPinch > 0) radius = clamp(radius * (lastPinch / dist), 1.25, 4.2);
				lastPinch = dist;
				placeCamera();
				return;
			}
			yaw -= (event.clientX - lastX) * .008;
			pitch = clamp(pitch + (event.clientY - lastY) * .006, .78, 1.55);
			lastX = event.clientX;
			lastY = event.clientY;
			placeCamera();
		};
		const onUp = (event) => {
			pointers.delete(event.pointerId);
			lastPinch = 0;
		};
		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("pointermove", onMove);
		canvas.addEventListener("pointerup", onUp);
		canvas.addEventListener("pointercancel", onUp);
		const resize = () => {
			const w = Math.max(1, wrap.clientWidth);
			const h = Math.max(1, wrap.clientHeight);
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(wrap);
		resize();
		let frame = 0;
		const loop = () => {
			frame = requestAnimationFrame(loop);
			const current = propsRef.current;
			const face = faceRef.current;
			const sound = current.sampleSound();
			const blink = blinkCurve(performance.now());
			if (face?.morphTargetInfluences && face.morphTargetDictionary) {
				const influences = sound ? soundInfluences(face, sound, current.expression) : presetInfluences(face, current.preset, current.expression);
				const left = face.morphTargetDictionary.eyeBlinkLeft;
				const right = face.morphTargetDictionary.eyeBlinkRight;
				if (left !== void 0) influences[left] = Math.max(influences[left] ?? 0, blink);
				if (right !== void 0) influences[right] = Math.max(influences[right] ?? 0, blink);
				for (let i = 0; i < face.morphTargetInfluences.length; i++) face.morphTargetInfluences[i] = influences[i] ?? 0;
				face.scale.setScalar(current.headScale);
				face.position.y = current.headY;
				face.position.z = .055 + current.headZ;
			}
			const root = characterRef.current;
			if (root) poseProxies(root, sound ? (sound.jawOpen ?? 0) * current.expression : face ? readMorph(face, "jawOpen") : current.preset === "wow" ? .55 : .05, sound ? ((sound.mouthSmileLeft ?? 0) + (sound.mouthSmileRight ?? 0)) / 2 * current.expression : current.preset === "smile" ? .7 * current.expression : 0, Math.max(blink, (sound?.eyeBlinkLeft ?? 0) * current.expression));
			renderer.render(scene, camera);
		};
		loop();
		setBooted((n) => n + 1);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("pointermove", onMove);
			canvas.removeEventListener("pointerup", onUp);
			canvas.removeEventListener("pointercancel", onUp);
			if (characterRef.current) {
				scene.remove(characterRef.current);
				disposeCharacter(characterRef.current);
				characterRef.current = null;
				faceRef.current = null;
			}
			ground.geometry.dispose();
			ground.material.dispose();
			renderer.dispose();
			canvas.remove();
			rendererRef.current = null;
			sceneRef.current = null;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		if (characterRef.current) {
			scene.remove(characterRef.current);
			disposeCharacter(characterRef.current);
			characterRef.current = null;
			faceRef.current = null;
		}
		const group = buildCharacter({
			body: props.body,
			outfit: props.outfit,
			hair: props.hair,
			skin: props.skin
		});
		const built = getFaceCache()?.[props.faceChoice];
		if (built) {
			const face = makeFace(built);
			group.getObjectByName("HeadAnchor")?.add(face);
			faceRef.current = face;
			setProxyVisible(group, false);
		}
		scene.add(group);
		characterRef.current = group;
	}, [
		props.body,
		props.outfit,
		props.hair,
		props.skin,
		props.faceChoice,
		props.faceRev,
		booted
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: wrapRef,
		className: "h-full w-full"
	});
});
function makeFace(built) {
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(built.positions.slice(), 3));
	geometry.setAttribute("uv", new BufferAttribute(built.uvs.slice(), 2));
	geometry.setIndex(new BufferAttribute(built.indices, 1));
	geometry.computeVertexNormals();
	geometry.morphAttributes.position = built.morphs.map((morph) => new BufferAttribute(morph.slice(), 3));
	const texture = new CanvasTexture(built.texture);
	texture.colorSpace = SRGBColorSpace;
	texture.flipY = true;
	texture.anisotropy = 4;
	const material = new MeshStandardMaterial({
		map: texture,
		roughness: .55,
		metalness: .02,
		side: 2
	});
	const mesh = new Mesh(geometry, material);
	mesh.name = "ARKitFace";
	mesh.morphTargetDictionary = Object.fromEntries(ARKIT_BLENDSHAPE_NAMES.map((name, index) => [name, index]));
	mesh.morphTargetInfluences = built.influences.slice();
	mesh.userData.base = built.influences.slice();
	return mesh;
}
function presetInfluences(mesh, preset, expression) {
	const base = mesh.userData.base ?? [];
	const count = mesh.morphTargetInfluences?.length ?? 0;
	const out = new Array(count).fill(0);
	if (preset === "captured") {
		for (let i = 0; i < count; i++) out[i] = (base[i] ?? 0) * expression;
		return out;
	}
	for (const [name, value] of Object.entries(PRESETS[preset])) {
		const index = mesh.morphTargetDictionary?.[name];
		if (index !== void 0) out[index] = (value ?? 0) * expression;
	}
	return out;
}
function soundInfluences(mesh, weights, expression) {
	const count = mesh.morphTargetInfluences?.length ?? 0;
	const out = new Array(count).fill(0);
	const dict = mesh.morphTargetDictionary ?? {};
	for (const name of Object.keys(dict)) {
		if (!DRIVEN.has(name) && !name.startsWith("eye")) continue;
		const index = dict[name];
		if (index === void 0) continue;
		out[index] = (weights[name] ?? 0) * expression;
	}
	return out;
}
function readMorph(mesh, name) {
	const index = mesh.morphTargetDictionary?.[name];
	if (index === void 0) return 0;
	return mesh.morphTargetInfluences?.[index] ?? 0;
}
function poseProxies(root, jaw, smile, blink) {
	const mouth = root.getObjectByName("ProxyMouth");
	const eyeL = root.getObjectByName("ProxyEyeL");
	const eyeR = root.getObjectByName("ProxyEyeR");
	if (mouth) {
		mouth.scale.set(1.15 + smile * .55, .22 + Math.max(0, jaw) * 1.35, .5);
		mouth.position.y = -.045 - Math.max(0, jaw) * .02;
	}
	const shut = 1 - .88 * clamp(blink, 0, 1);
	if (eyeL) eyeL.scale.y = shut;
	if (eyeR) eyeR.scale.y = shut;
}
function setProxyVisible(root, visible) {
	for (const name of [
		"ProxyMouth",
		"ProxyEyeL",
		"ProxyEyeR"
	]) {
		const obj = root.getObjectByName(name);
		if (obj) obj.visible = visible;
	}
}
function blinkCurve(now) {
	const x = now % 4200;
	if (x > 150) return 0;
	if (x < 70) return x / 70;
	return 1 - (x - 70) / 80;
}
function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}
function exportGroup(root) {
	if (!root) return Promise.reject(/* @__PURE__ */ new Error("Nothing to export yet"));
	const exporter = new GLTFExporter();
	return new Promise((resolve, reject) => {
		exporter.parse(root, (result) => {
			if (result instanceof ArrayBuffer) {
				resolve(new Blob([result], { type: "model/gltf-binary" }));
				return;
			}
			reject(/* @__PURE__ */ new Error("Export failed"));
		}, (error) => reject(error instanceof Error ? error : /* @__PURE__ */ new Error("Export failed")), { binary: true });
	});
}
var PANELS = [
	{
		id: "body",
		label: "Body",
		icon: UserRound
	},
	{
		id: "look",
		label: "Look",
		icon: Shirt
	},
	{
		id: "face",
		label: "Face",
		icon: Smile
	},
	{
		id: "voice",
		label: "Voice",
		icon: AudioLines
	},
	{
		id: "save",
		label: "Save",
		icon: Save
	}
];
function StudioApp() {
	const screen = useStudio((s) => s.screen);
	const patch = useStudio((s) => s.patch);
	const cameraRef = (0, import_react.useRef)(null);
	const libraryRef = (0, import_react.useRef)(null);
	const engineRef = (0, import_react.useRef)(null);
	const [saved, setSaved] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		const engine = new Sound2Face();
		engine.onEnd = () => patch({ talk: "off" });
		engineRef.current = engine;
		return () => engine.dispose();
	}, [patch]);
	(0, import_react.useEffect)(() => {
		listAvatars().then(setSaved).catch(() => setSaved([]));
	}, [screen]);
	async function takePhoto(file) {
		patch({
			screen: "studio",
			panel: "face",
			status: "working",
			statusText: "Finding your face…",
			error: null
		});
		try {
			const { prepareAndDetect } = await import("./detect-GX8TkQO8.mjs");
			const preview = await prepareAndDetect(file, (statusText) => patch({ statusText }));
			const state = useStudio.getState();
			patch({
				status: "ready",
				statusText: "",
				hasFace: true,
				faceRev: state.faceRev + 1,
				photoPreview: preview,
				error: null
			});
		} catch (error) {
			const missing = error instanceof Error && error.message === "NO_FACE";
			patch({
				status: "error",
				statusText: "",
				error: missing ? "We could not find a face in that photo. Try another one, looking straight at the camera." : "Face detection didn't start. Please try again."
			});
		}
	}
	async function onFile(event) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file) await takePhoto(file);
	}
	async function useSample() {
		const res = await fetch("/samples/portrait.jpg");
		if (!res.ok) {
			patch({
				screen: "studio",
				error: "The sample portrait is missing.",
				status: "error"
			});
			return;
		}
		await takePhoto(await res.blob());
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			ref: cameraRef,
			className: "sr-only",
			type: "file",
			accept: "image/*",
			capture: "user",
			onChange: onFile
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			ref: libraryRef,
			className: "sr-only",
			type: "file",
			accept: "image/*",
			onChange: onFile
		}),
		screen === "home" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Home, {
			savedCount: saved.length,
			onCamera: () => cameraRef.current?.click(),
			onLibrary: () => libraryRef.current?.click(),
			onSample: () => void useSample(),
			onBrowse: () => patch({
				screen: "studio",
				panel: "body",
				error: null,
				status: "idle"
			}),
			onSaved: () => patch({ screen: "library" })
		}) : null,
		screen === "library" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Library, {
			items: saved,
			onBack: () => patch({ screen: "home" }),
			onOpen: (item) => void restore(item, takePhoto),
			onDelete: async (id) => {
				await deleteAvatar(id);
				setSaved(await listAvatars());
			}
		}) : null,
		screen === "studio" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Studio, {
			engineRef,
			onBack: () => {
				engineRef.current?.stop();
				patch({
					screen: "home",
					talk: "off"
				});
			},
			onCamera: () => cameraRef.current?.click(),
			onLibrary: () => libraryRef.current?.click(),
			onSample: () => void useSample(),
			refreshSaves: async () => setSaved(await listAvatars())
		}) : null
	] });
}
function Home({ savedCount, onCamera, onLibrary, onSample, onBrowse, onSaved }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "weave safe-top safe-bottom min-h-dvh",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between py-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-[0.22em] text-muted uppercase",
					children: "StreamWeaver"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "text-sm text-fg",
					onClick: onSaved,
					children: ["Saved", savedCount ? ` ${savedCount}` : ""]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-1 flex-col justify-end",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-4xl leading-[1.05] font-medium text-balance text-fg",
						children: "Your face, a body, and a voice."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 max-w-sm text-pretty text-muted",
						children: "Build a 3D avatar from a photo, then let Sound2Face move it while an AI voice — or you — talks."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-8 flex flex-col gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "h-14 rounded-full bg-primary text-base font-medium text-primary-fg",
								onClick: onCamera,
								children: "Take a photo"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "h-12 rounded-full border border-border bg-surface text-fg",
								onClick: onLibrary,
								children: "Choose from library"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "h-12 rounded-full text-muted",
								onClick: onBrowse,
								children: "Browse the studio first"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "h-12 text-sm text-accent",
								onClick: onSample,
								children: "Try the sample portrait"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-8 rounded-2xl border border-border bg-surface p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-medium text-fg",
								children: "On your phone"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm text-pretty text-muted",
								children: "Add this to your home screen and it opens full screen, from its own icon. No app store."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
								className: "mt-3 space-y-2 text-sm text-fg",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-primary",
									children: "iPhone"
								}), " — Share, then Add to Home Screen"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-primary",
									children: "Android"
								}), " — menu, then Install app or Add to Home screen"] })]
							})
						]
					})
				]
			})]
		})
	});
}
function Library({ items, onBack, onOpen, onDelete }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "safe-top safe-bottom min-h-dvh bg-bg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto w-full max-w-lg px-5 pb-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center gap-3 py-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "grid size-11 place-items-center rounded-full bg-surface text-fg",
					onClick: onBack,
					"aria-label": "Back",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "size-5" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "font-display text-2xl text-fg",
					children: "Saved on this phone"
				})]
			}), items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8 text-pretty text-muted",
				children: "Nothing saved yet. Build one in the studio, then tap Save on this phone."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 space-y-3",
				children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-3 rounded-2xl border border-border bg-surface p-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "flex min-w-0 flex-1 items-center gap-3 text-left",
						onClick: () => onOpen(item),
						children: [item.thumb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: item.thumb,
							alt: "",
							className: "size-16 rounded-xl object-cover"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-16 place-items-center rounded-xl bg-surface-2 text-muted",
							children: "3D"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate font-medium text-fg",
								children: item.title
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block text-sm text-muted",
								children: new Date(item.createdAt).toLocaleDateString()
							})]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "grid size-11 place-items-center text-muted",
						"aria-label": "Delete",
						onClick: () => onDelete(item.id),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
					})]
				}, item.id))
			})]
		})
	});
}
function Studio({ engineRef, onBack, onCamera, onLibrary, onSample, refreshSaves }) {
	const state = useStudio();
	const viewRef = (0, import_react.useRef)(null);
	const [saveNote, setSaveNote] = (0, import_react.useState)(null);
	const [showPhoneVoice, setShowPhoneVoice] = (0, import_react.useState)(false);
	async function speakAi() {
		const engine = engineRef.current;
		const { line, voiceId } = useStudio.getState();
		if (!engine || !line.trim()) return;
		engine.unlock();
		engine.stop();
		state.patch({
			talk: "gen",
			talkNote: null
		});
		const result = await speakLine({ data: {
			text: line,
			voiceId
		} });
		if (!result.ok) {
			state.patch({
				talk: "off",
				talkNote: result.error
			});
			setShowPhoneVoice(true);
			return;
		}
		const raw = atob(result.audioBase64);
		const bytes = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
		try {
			await engine.play(bytes.buffer);
			state.patch({ talk: "play" });
		} catch {
			state.patch({
				talk: "off",
				talkNote: "That audio couldn't play. Try this phone's voice."
			});
			setShowPhoneVoice(true);
		}
	}
	function speakLocal() {
		const engine = engineRef.current;
		const line = useStudio.getState().line.trim();
		if (!engine || !line || !("speechSynthesis" in window)) return;
		engine.stop();
		const duration = Math.max(1e3, line.length * 64);
		const start = performance.now();
		let raf = 0;
		const utter = new SpeechSynthesisUtterance(line);
		const finish = () => {
			cancelAnimationFrame(raf);
			engine.setScripted(null);
			state.patch({ talk: "off" });
		};
		utter.onstart = () => {
			state.patch({
				talk: "play",
				talkNote: null
			});
			const tick = () => {
				const t = (performance.now() - start) / duration;
				if (t >= 1) return;
				engine.setScripted(scriptWeights(t));
				raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};
		utter.onend = finish;
		utter.onerror = finish;
		window.speechSynthesis.speak(utter);
	}
	async function liveMic() {
		const engine = engineRef.current;
		if (!engine) return;
		engine.unlock();
		state.patch({
			talk: "mic",
			talkNote: null
		});
		try {
			await engine.startMic();
		} catch {
			engine.stop();
			state.patch({
				talk: "off",
				talkNote: "The microphone isn't available here. Try the AI voice, or open this on your phone."
			});
		}
	}
	function stopTalk() {
		engineRef.current?.stop();
		state.patch({ talk: "off" });
	}
	async function download() {
		try {
			const blob = await viewRef.current?.exportGlb();
			if (!blob) return;
			const file = new File([blob], "streamweaver-avatar.glb", { type: "model/gltf-binary" });
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: "StreamWeaver avatar"
				});
				return;
			}
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = file.name;
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			setSaveNote("Couldn't export just then. Try again.");
		}
	}
	async function keep() {
		const snap = useStudio.getState();
		const thumb = viewRef.current?.snapshot() || snap.photoPreview || "";
		await saveAvatar({
			id: crypto.randomUUID(),
			createdAt: Date.now(),
			title: `${labelOf(BODIES, snap.body)} · ${labelOf(OUTFITS, snap.outfit)}`,
			thumb,
			photo: getPendingPhoto(),
			body: snap.body,
			outfit: snap.outfit,
			hair: snap.hair,
			skin: snap.skin,
			faceChoice: snap.faceChoice,
			headScale: snap.headScale,
			headY: snap.headY,
			headZ: snap.headZ,
			expression: snap.expression
		});
		await refreshSaves();
		setSaveNote("Saved on this phone.");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col overflow-hidden bg-bg text-fg lg:grid lg:grid-cols-[minmax(0,1fr)_400px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative min-h-0 flex-1 bg-bg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Viewport, {
					ref: viewRef,
					body: state.body,
					outfit: state.outfit,
					hair: state.hair,
					skin: state.skin,
					faceChoice: state.faceChoice,
					preset: state.preset,
					headScale: state.headScale,
					headY: state.headY,
					headZ: state.headZ,
					expression: state.expression,
					faceRev: state.faceRev,
					sampleSound: () => engineRef.current?.sample() ?? null
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "safe-top pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "pointer-events-auto grid size-11 place-items-center rounded-full bg-surface/90 text-fg",
							onClick: onBack,
							"aria-label": "Back",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "size-5" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "rounded-full bg-surface/90 px-3 py-1 text-xs tracking-wide text-muted",
							children: "Drag to turn"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-11" })
					]
				}),
				state.status === "working" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "absolute inset-x-0 bottom-4 text-center text-sm text-fg",
					role: "status",
					children: state.statusText
				}) : null,
				state.talk === "play" || state.talk === "mic" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "absolute inset-x-0 bottom-4 text-center text-sm text-primary",
					role: "status",
					children: state.talk === "mic" ? "Listening — the face is following you" : "Speaking — the face is following the audio"
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "safe-bottom flex max-h-[52dvh] flex-col border-t border-border bg-surface lg:max-h-none lg:border-t-0 lg:border-l",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 overflow-y-auto px-4 py-3",
				children: [
					state.panel === "body" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BodyPanel, {}) : null,
					state.panel === "look" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LookPanel, {}) : null,
					state.panel === "face" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FacePanel, {
						onCamera,
						onLibrary,
						onSample
					}) : null,
					state.panel === "voice" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VoicePanel, {
						showPhoneVoice,
						onAi: () => void speakAi(),
						onMic: () => void liveMic(),
						onLocal: speakLocal,
						onStop: stopTalk
					}) : null,
					state.panel === "save" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SavePanel, {
						note: saveNote,
						onDownload: () => void download(),
						onKeep: () => void keep()
					}) : null
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "grid grid-cols-5 border-t border-border",
				children: PANELS.map((panel) => {
					const Icon = panel.icon;
					const on = state.panel === panel.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: `flex h-14 flex-col items-center justify-center gap-0.5 text-xs ${on ? "text-primary" : "text-muted"}`,
						onClick: () => state.patch({ panel: panel.id }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), panel.label]
					}, panel.id);
				})
			})]
		})]
	});
}
function BodyPanel() {
	const body = useStudio((s) => s.body);
	const patch = useStudio((s) => s.patch);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: "font-display text-xl text-fg",
		children: "Choose a body"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-3 grid grid-cols-2 gap-2",
		children: BODIES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
			on: body === item.id,
			label: item.label,
			note: item.note,
			onClick: () => patch({ body: item.id })
		}, item.id))
	})] });
}
function LookPanel() {
	const outfit = useStudio((s) => s.outfit);
	const hair = useStudio((s) => s.hair);
	const skin = useStudio((s) => s.skin);
	const patch = useStudio((s) => s.patch);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-xl text-fg",
				children: "Choose an outfit"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 grid grid-cols-2 gap-2",
				children: OUTFITS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					on: outfit === item.id,
					label: item.label,
					note: item.note,
					onClick: () => patch({ outfit: item.id })
				}, item.id))
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-sm text-muted",
				children: "Hair"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 flex gap-2",
				children: HAIR.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: `h-11 flex-1 rounded-full border ${hair === item.id ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"}`,
					onClick: () => patch({ hair: item.id }),
					children: item.label
				}, item.id))
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-sm text-muted",
				children: "Skin"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 flex gap-2",
				children: SKINS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": item.label,
					className: `size-11 rounded-full border-2 ${skin === item.id ? "border-primary" : "border-transparent"}`,
					style: { background: item.swatch },
					onClick: () => patch({ skin: item.id })
				}, item.id))
			})] })
		]
	});
}
function FacePanel({ onCamera, onLibrary, onSample }) {
	const state = useStudio();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl text-fg",
					children: "Create a face"
				}), state.photoPreview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: state.photoPreview,
					alt: "",
					className: "size-12 rounded-full object-cover"
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-fg",
					onClick: onCamera,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "size-4" }), " Camera"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm text-fg",
					onClick: onLibrary,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, { className: "size-4" }), " Library"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "text-sm text-accent",
				onClick: onSample,
				children: "Use the sample portrait"
			}),
			state.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-pretty text-fg",
				children: state.error
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					on: state.faceChoice === "standard",
					label: "Standard",
					note: "Closest to the photo",
					disabled: !state.hasFace,
					onClick: () => state.patch({ faceChoice: "standard" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
					on: state.faceChoice === "detail",
					label: "Higher detail",
					note: "Smoother, stronger",
					disabled: !state.hasFace,
					onClick: () => state.patch({ faceChoice: "detail" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-pretty text-muted",
				children: "Both keep the 52 expressions, so Sound2Face and Audio2Face can drive them."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-2",
				children: [
					["captured", "Photo"],
					["smile", "Smile"],
					["blink", "Blink"],
					["wow", "Surprise"]
				].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: !state.hasFace,
					className: `h-10 flex-1 rounded-full border text-xs disabled:opacity-40 ${state.preset === id ? "border-primary text-fg" : "border-border text-muted"}`,
					onClick: () => state.patch({ preset: id }),
					children: label
				}, id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				label: "Head size",
				min: .8,
				max: 1.35,
				step: .01,
				value: state.headScale,
				onChange: (headScale) => state.patch({ headScale })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				label: "Height",
				min: -.06,
				max: .08,
				step: .005,
				value: state.headY,
				onChange: (headY) => state.patch({ headY })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				label: "Depth",
				min: -.04,
				max: .1,
				step: .005,
				value: state.headZ,
				onChange: (headZ) => state.patch({ headZ })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				label: "Expression",
				min: 0,
				max: 1.4,
				step: .01,
				value: state.expression,
				onChange: (expression) => state.patch({ expression })
			})
		]
	});
}
function VoicePanel({ showPhoneVoice, onAi, onMic, onLocal, onStop }) {
	const line = useStudio((s) => s.line);
	const voiceId = useStudio((s) => s.voiceId);
	const talk = useStudio((s) => s.talk);
	const talkNote = useStudio((s) => s.talkNote);
	const patch = useStudio((s) => s.patch);
	const busy = talk === "gen" || talk === "play" || talk === "mic";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-xl text-fg",
				children: "Sound2Face"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-pretty text-muted",
				children: "Type a line. The AI voice speaks it, and the face follows the audio as it plays — the same ARKit expressions NVIDIA Audio2Face writes, live on this phone."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				value: line,
				maxLength: 280,
				rows: 3,
				className: "w-full resize-none rounded-2xl border border-border bg-bg px-3 py-3 text-fg outline-none",
				onChange: (event) => patch({ line: event.target.value })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: VOICES.map((voice) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: `h-10 rounded-full border px-3 text-sm ${voiceId === voice.id ? "border-primary text-fg" : "border-border text-muted"}`,
					onClick: () => patch({ voiceId: voice.id }),
					children: [voice.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-1 text-xs text-muted",
						children: voice.note
					})]
				}, voice.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-fg disabled:opacity-50",
					disabled: busy || !line.trim(),
					onClick: onAi,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioLines, { className: "size-4" }), talk === "gen" ? "Making voice…" : "AI voice"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex h-12 items-center justify-center gap-2 rounded-full border border-border text-fg disabled:opacity-50",
					disabled: talk === "gen",
					onClick: talk === "mic" ? onStop : onMic,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, { className: "size-4" }), talk === "mic" ? "Stop mic" : "Live mic"]
				})]
			}),
			talk === "play" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-fg",
				onClick: onStop,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-4" }), " Stop"]
			}) : null,
			talkNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-pretty text-fg",
				children: talkNote
			}) : null,
			showPhoneVoice ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-fg",
				onClick: onLocal,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" }), " Use this phone's voice"]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-pretty text-muted",
				children: "AI speech takes a second to generate, then the mouth stays in sync. The mic is instant — that's the real-time path, like talking into Audio2Face."
			})
		]
	});
}
function SavePanel({ note, onDownload, onKeep }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-xl text-fg",
				children: "Your avatar is ready"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-pretty text-muted",
				children: "The file includes the 52 face expressions, so it can move in StreamWeaver, VSeeFace, Unity, or from an Audio2Face stream."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-fg",
				onClick: onDownload,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), " Download GLB"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-fg",
				onClick: onKeep,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }), " Save on this phone"]
			}),
			note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-fg",
				children: note
			}) : null
		]
	});
}
function Choice({ on, label, note, onClick, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		disabled,
		onClick,
		className: `rounded-2xl border px-3 py-3 text-left disabled:opacity-40 ${on ? "border-primary bg-surface-2" : "border-border bg-bg"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block font-medium text-fg",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block text-xs text-muted",
			children: note
		})]
	});
}
function Slider({ label, min, max, step, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "mb-1 flex justify-between text-sm text-muted",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "tabular-nums text-fg",
				children: value.toFixed(2)
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			className: "range",
			type: "range",
			min,
			max,
			step,
			value,
			onChange: (event) => onChange(Number(event.target.value))
		})]
	});
}
async function restore(item, takePhoto) {
	useStudio.getState().patch({
		screen: "studio",
		panel: "face",
		body: item.body,
		outfit: item.outfit,
		hair: item.hair,
		skin: item.skin,
		faceChoice: item.faceChoice,
		headScale: item.headScale,
		headY: item.headY,
		headZ: item.headZ,
		expression: item.expression,
		error: null
	});
	if (!item.photo) return;
	await takePhoto(await (await fetch(item.photo)).blob());
}
var routes_exports = /* @__PURE__ */ __exportAll({ component: () => SplitComponent });
var SplitComponent = StudioApp;
//#endregion
export { ARKIT_INDEX as a, ARKIT_BLENDSHAPE_NAMES as i, setPendingPhoto as n, setFaceCache as r, routes_exports as t };
