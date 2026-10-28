//#region node_modules/.nitro/vite/services/ssr/assets/constants-BO4bJ6T1.js
var BODIES = [
	{
		id: "slim",
		label: "Slim",
		note: "Narrow shoulders"
	},
	{
		id: "balanced",
		label: "Balanced",
		note: "Everyday build"
	},
	{
		id: "athletic",
		label: "Athletic",
		note: "Broader shoulders"
	},
	{
		id: "solid",
		label: "Solid",
		note: "Fuller torso"
	}
];
var OUTFITS = [
	{
		id: "tee",
		label: "Tee",
		note: "Plain shirt"
	},
	{
		id: "hoodie",
		label: "Hoodie",
		note: "Hood up"
	},
	{
		id: "jacket",
		label: "Jacket",
		note: "Collared layer"
	},
	{
		id: "dress",
		label: "Dress",
		note: "Flared skirt"
	},
	{
		id: "layers",
		label: "Layers",
		note: "Shirt and overshirt"
	}
];
var HAIR = [
	{
		id: "none",
		label: "None"
	},
	{
		id: "short",
		label: "Short"
	},
	{
		id: "long",
		label: "Long"
	}
];
var SKINS = [
	{
		id: "porcelain",
		label: "Porcelain",
		swatch: "#f2d3c4"
	},
	{
		id: "sand",
		label: "Sand",
		swatch: "#e0b08a"
	},
	{
		id: "amber",
		label: "Amber",
		swatch: "#c68642"
	},
	{
		id: "bronze",
		label: "Bronze",
		swatch: "#8d5524"
	},
	{
		id: "deep",
		label: "Deep",
		swatch: "#4b2e1f"
	}
];
var VOICES = [
	{
		id: "eve",
		label: "Eve",
		note: "Warm"
	},
	{
		id: "ara",
		label: "Ara",
		note: "Bright"
	},
	{
		id: "leo",
		label: "Leo",
		note: "Calm"
	},
	{
		id: "rex",
		label: "Rex",
		note: "Low"
	},
	{
		id: "sal",
		label: "Sal",
		note: "Easy"
	}
];
function labelOf(list, id) {
	return list.find((item) => item.id === id)?.label ?? id;
}
//#endregion
export { VOICES as a, SKINS as i, HAIR as n, labelOf as o, OUTFITS as r, BODIES as t };
