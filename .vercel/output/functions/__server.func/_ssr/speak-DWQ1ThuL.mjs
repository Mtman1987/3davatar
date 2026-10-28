import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as VOICES } from "./constants-BO4bJ6T1.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/speak-DWQ1ThuL.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var ALLOWED = new Set(VOICES.map((voice) => voice.id));
var speakLine_createServerFn_handler = createServerRpc({
	id: "c25fd90b0ae090a799d848351f5abcc83d53cee2dc6f8ba505f67166e3792632",
	name: "speakLine",
	filename: "src/lib/avatar/speak.ts"
}, (opts) => speakLine.__executeServer(opts));
var speakLine = createServerFn({ method: "POST" }).validator((input) => {
	const raw = input ?? {};
	return {
		text: typeof raw.text === "string" ? raw.text.trim().slice(0, 280) : "",
		voiceId: typeof raw.voiceId === "string" && ALLOWED.has(raw.voiceId) ? raw.voiceId : "eve"
	};
}).handler(speakLine_createServerFn_handler, async ({ data }) => {
	if (!data.text) return {
		ok: false,
		error: "Type a line first."
	};
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "AI voice isn't available right now. Use the live mic, or this phone's voice."
	};
	const res = await fetch("https://api.x.ai/v1/tts", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			text: data.text,
			voice_id: data.voiceId,
			language: "en"
		})
	});
	const type = res.headers.get("content-type") ?? "";
	if (!res.ok || type.includes("application/json") || type.includes("text/")) return {
		ok: false,
		error: "The AI voice didn't come back. Try again, or use this phone's voice."
	};
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength < 200) return {
		ok: false,
		error: "The AI voice came back empty. Try again."
	};
	let binary = "";
	const chunk = 32768;
	for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	return {
		ok: true,
		audioBase64: btoa(binary),
		mime: "audio/mpeg"
	};
});
//#endregion
export { speakLine_createServerFn_handler };
