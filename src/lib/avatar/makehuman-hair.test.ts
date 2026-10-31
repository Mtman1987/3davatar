import test from "node:test";
import assert from "node:assert/strict";
import { parseMakeHumanHairProxy } from "./makehuman-hair.ts";
import { fitMakeHumanHair, makeHumanHairOffsetMatrix } from "./makehuman-hair-transform.ts";

test("parses verts 0 as the fitting-map marker and preserves extrapolation weights", () => {
  const proxy = parseMakeHumanHairProxy([
    "basemesh hm08", "obj_file sample.obj",
    "x_scale 0 1 2", "y_scale 2 3 4", "z_scale 4 5 5", "verts 0",
    "0 1 2 -0.5 1.25 0.25 0.1 0.2 0.3",
  ].join("\n"));
  assert.equal(proxy.fitRecords.length, 1);
  assert.deepEqual(proxy.fitRecords[0]!.weights, [-0.5, 1.25, 0.25]);
  assert.deepEqual(proxy.fitRecords[0]!.offset, [0.1, 0.2, 0.3]);
});

test("applies MakeHuman scale-derived offset matrix before fitting", () => {
  const proxy = parseMakeHumanHairProxy([
    "basemesh hm08", "x_scale 0 1 2", "y_scale 2 3 4", "z_scale 4 5 5", "verts 0",
    "0 1 2 1 0 0 1 1 1",
  ].join("\n"));
  const base = new Float32Array([0,0,0, 4,0,0, 0,8,0, 0,0,10, 0,0,0, 0,0,5]);
  assert.deepEqual([...makeHumanHairOffsetMatrix(base, proxy)], [2,0,0, 0,2,0, 0,0,1]);
  assert.deepEqual([...fitMakeHumanHair(base, proxy)], [2,2,1]);
});

test("rejects fitting records that reference outside the hm08 mesh", () => {
  const proxy = parseMakeHumanHairProxy(["basemesh hm08", "verts 0", "0 1 9 1 0 0 0 0 0"].join("\n"));
  assert.throws(() => fitMakeHumanHair(new Float32Array([0,0,0, 1,1,1]), proxy), /outside/);
});
