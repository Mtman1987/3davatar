import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMakeHumanHairProxy,
  fitMakeHumanHairVertices,
  validateMakeHumanHairVertexCount,
} from "./makehuman-hair.ts";

test("parses verts 0 as the fitting-map marker and preserves extrapolation weights", () => {
  const proxy = parseMakeHumanHairProxy([
    "basemesh hm08", "obj_file sample.obj",
    "x_scale 0 1 2", "y_scale 2 3 4", "z_scale 4 5 5",
    "l_shear_x 11998 5399 0.6990 -0.6990", "verts 1",
    "0 1 2 -0.5 1.25 0.25 0.1 0.2 0.3",
  ].join("\n"));
  assert.equal(proxy.baseMesh, "hm08");
  assert.equal(proxy.fitRecords.length, 1);
  assert.deepEqual(proxy.fitRecords[0]!.weights, [-0.5, 1.25, 0.25]);
  assert.deepEqual(proxy.fitRecords[0]!.offset, [0.1, 0.2, 0.3]);
  assert.deepEqual(proxy.scale.map(({ axis, vertices, factor }) => [axis, vertices, factor]), [
    ["x", [0, 1], 2], ["y", [2, 3], 4], ["z", [4, 5], 5],
  ]);
  assert.deepEqual(proxy.shear[0]!.factors, [0.699, -0.699]);
});

test("fits reference positions without clamping extrapolation weights", () => {
  const records = [{
    vertices: [0, 1, 2] as const,
    weights: [-0.5, 1.25, 0.25] as const,
    offset: [0.1, 0.2, 0.3] as const,
  }];
  const base = new Float32Array([0, 0, 0, 4, 0, 0, 0, 8, 0]);
  const fitted = fitMakeHumanHairVertices(base, records);
  assert.ok(Math.abs(fitted[0]! - 5.1) < 1e-6);
  assert.ok(Math.abs(fitted[1]! - 2.2) < 1e-6);
  assert.ok(Math.abs(fitted[2]! - 0.3) < 1e-6);
});

test("rejects out-of-range references and OBJ/fitting-map count mismatches", () => {
  const proxy = parseMakeHumanHairProxy([
    "basemesh hm08", "verts 1", "0 1 9 1 0 0 0 0 0",
  ].join("\n"));
  assert.throws(() => fitMakeHumanHairVertices(new Float32Array([0,0,0, 1,1,1]), proxy.fitRecords), /missing/);
  assert.equal(validateMakeHumanHairVertexCount(proxy, 2).valid, false);
  assert.equal(validateMakeHumanHairVertexCount(proxy, 1).valid, true);
});
