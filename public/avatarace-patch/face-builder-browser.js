"use strict";
var AvatarAceFaceBuilder = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // recovered-workspace/src/lib/avatar/face-builder-entry.ts
  var face_builder_entry_exports = {};
  __export(face_builder_entry_exports, {
    ARKIT_BLENDSHAPE_NAMES: () => ARKIT_BLENDSHAPE_NAMES,
    buildFace: () => buildFace
  });

  // recovered-workspace/node_modules/robust-predicates/esm/util.js
  var epsilon = 11102230246251565e-32;
  var splitter = 134217729;
  var resulterrbound = (3 + 8 * epsilon) * epsilon;
  function sum(elen, e, flen, f, h) {
    let Q, Qnew, hh, bvirt;
    let enow = e[0];
    let fnow = f[0];
    let eindex = 0;
    let findex = 0;
    if (fnow > enow === fnow > -enow) {
      Q = enow;
      enow = e[++eindex];
    } else {
      Q = fnow;
      fnow = f[++findex];
    }
    let hindex = 0;
    if (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = enow + Q;
        hh = Q - (Qnew - enow);
        enow = e[++eindex];
      } else {
        Qnew = fnow + Q;
        hh = Q - (Qnew - fnow);
        fnow = f[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
      while (eindex < elen && findex < flen) {
        if (fnow > enow === fnow > -enow) {
          Qnew = Q + enow;
          bvirt = Qnew - Q;
          hh = Q - (Qnew - bvirt) + (enow - bvirt);
          enow = e[++eindex];
        } else {
          Qnew = Q + fnow;
          bvirt = Qnew - Q;
          hh = Q - (Qnew - bvirt) + (fnow - bvirt);
          fnow = f[++findex];
        }
        Q = Qnew;
        if (hh !== 0) {
          h[hindex++] = hh;
        }
      }
    }
    while (eindex < elen) {
      Qnew = Q + enow;
      bvirt = Qnew - Q;
      hh = Q - (Qnew - bvirt) + (enow - bvirt);
      enow = e[++eindex];
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
    while (findex < flen) {
      Qnew = Q + fnow;
      bvirt = Qnew - Q;
      hh = Q - (Qnew - bvirt) + (fnow - bvirt);
      fnow = f[++findex];
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
    if (Q !== 0 || hindex === 0) {
      h[hindex++] = Q;
    }
    return hindex;
  }
  function estimate(elen, e) {
    let Q = e[0];
    for (let i = 1; i < elen; i++) Q += e[i];
    return Q;
  }
  function vec(n) {
    return new Float64Array(n);
  }

  // recovered-workspace/node_modules/robust-predicates/esm/orient2d.js
  var ccwerrboundA = (3 + 16 * epsilon) * epsilon;
  var ccwerrboundB = (2 + 12 * epsilon) * epsilon;
  var ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
  var B = vec(4);
  var C1 = vec(8);
  var C2 = vec(12);
  var D = vec(16);
  var u = vec(4);
  function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
    let acxtail, acytail, bcxtail, bcytail;
    let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u32;
    const acx = ax - cx;
    const bcx = bx - cx;
    const acy = ay - cy;
    const bcy = by - cy;
    s1 = acx * bcy;
    c = splitter * acx;
    ahi = c - (c - acx);
    alo = acx - ahi;
    c = splitter * bcy;
    bhi = c - (c - bcy);
    blo = bcy - bhi;
    s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
    t1 = acy * bcx;
    c = splitter * acy;
    ahi = c - (c - acy);
    alo = acy - ahi;
    c = splitter * bcx;
    bhi = c - (c - bcx);
    blo = bcx - bhi;
    t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
    _i = s0 - t0;
    bvirt = s0 - _i;
    B[0] = s0 - (_i + bvirt) + (bvirt - t0);
    _j = s1 + _i;
    bvirt = _j - s1;
    _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 - t1;
    bvirt = _0 - _i;
    B[1] = _0 - (_i + bvirt) + (bvirt - t1);
    u32 = _j + _i;
    bvirt = u32 - _j;
    B[2] = _j - (u32 - bvirt) + (_i - bvirt);
    B[3] = u32;
    let det = estimate(4, B);
    let errbound = ccwerrboundB * detsum;
    if (det >= errbound || -det >= errbound) {
      return det;
    }
    bvirt = ax - acx;
    acxtail = ax - (acx + bvirt) + (bvirt - cx);
    bvirt = bx - bcx;
    bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
    bvirt = ay - acy;
    acytail = ay - (acy + bvirt) + (bvirt - cy);
    bvirt = by - bcy;
    bcytail = by - (bcy + bvirt) + (bvirt - cy);
    if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
      return det;
    }
    errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
    det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
    if (det >= errbound || -det >= errbound) return det;
    s1 = acxtail * bcy;
    c = splitter * acxtail;
    ahi = c - (c - acxtail);
    alo = acxtail - ahi;
    c = splitter * bcy;
    bhi = c - (c - bcy);
    blo = bcy - bhi;
    s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
    t1 = acytail * bcx;
    c = splitter * acytail;
    ahi = c - (c - acytail);
    alo = acytail - ahi;
    c = splitter * bcx;
    bhi = c - (c - bcx);
    blo = bcx - bhi;
    t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
    _i = s0 - t0;
    bvirt = s0 - _i;
    u[0] = s0 - (_i + bvirt) + (bvirt - t0);
    _j = s1 + _i;
    bvirt = _j - s1;
    _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 - t1;
    bvirt = _0 - _i;
    u[1] = _0 - (_i + bvirt) + (bvirt - t1);
    u32 = _j + _i;
    bvirt = u32 - _j;
    u[2] = _j - (u32 - bvirt) + (_i - bvirt);
    u[3] = u32;
    const C1len = sum(4, B, 4, u, C1);
    s1 = acx * bcytail;
    c = splitter * acx;
    ahi = c - (c - acx);
    alo = acx - ahi;
    c = splitter * bcytail;
    bhi = c - (c - bcytail);
    blo = bcytail - bhi;
    s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
    t1 = acy * bcxtail;
    c = splitter * acy;
    ahi = c - (c - acy);
    alo = acy - ahi;
    c = splitter * bcxtail;
    bhi = c - (c - bcxtail);
    blo = bcxtail - bhi;
    t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
    _i = s0 - t0;
    bvirt = s0 - _i;
    u[0] = s0 - (_i + bvirt) + (bvirt - t0);
    _j = s1 + _i;
    bvirt = _j - s1;
    _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 - t1;
    bvirt = _0 - _i;
    u[1] = _0 - (_i + bvirt) + (bvirt - t1);
    u32 = _j + _i;
    bvirt = u32 - _j;
    u[2] = _j - (u32 - bvirt) + (_i - bvirt);
    u[3] = u32;
    const C2len = sum(C1len, C1, 4, u, C2);
    s1 = acxtail * bcytail;
    c = splitter * acxtail;
    ahi = c - (c - acxtail);
    alo = acxtail - ahi;
    c = splitter * bcytail;
    bhi = c - (c - bcytail);
    blo = bcytail - bhi;
    s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
    t1 = acytail * bcxtail;
    c = splitter * acytail;
    ahi = c - (c - acytail);
    alo = acytail - ahi;
    c = splitter * bcxtail;
    bhi = c - (c - bcxtail);
    blo = bcxtail - bhi;
    t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
    _i = s0 - t0;
    bvirt = s0 - _i;
    u[0] = s0 - (_i + bvirt) + (bvirt - t0);
    _j = s1 + _i;
    bvirt = _j - s1;
    _0 = s1 - (_j - bvirt) + (_i - bvirt);
    _i = _0 - t1;
    bvirt = _0 - _i;
    u[1] = _0 - (_i + bvirt) + (bvirt - t1);
    u32 = _j + _i;
    bvirt = u32 - _j;
    u[2] = _j - (u32 - bvirt) + (_i - bvirt);
    u[3] = u32;
    const Dlen = sum(C2len, C2, 4, u, D);
    return D[Dlen - 1];
  }
  function orient2d(ax, ay, bx, by, cx, cy) {
    const detleft = (ay - cy) * (bx - cx);
    const detright = (ax - cx) * (by - cy);
    const det = detleft - detright;
    const detsum = Math.abs(detleft + detright);
    if (Math.abs(det) >= ccwerrboundA * detsum) return det;
    return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
  }

  // recovered-workspace/node_modules/robust-predicates/esm/orient3d.js
  var o3derrboundA = (7 + 56 * epsilon) * epsilon;
  var o3derrboundB = (3 + 28 * epsilon) * epsilon;
  var o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
  var bc = vec(4);
  var ca = vec(4);
  var ab = vec(4);
  var at_b = vec(4);
  var at_c = vec(4);
  var bt_c = vec(4);
  var bt_a = vec(4);
  var ct_a = vec(4);
  var ct_b = vec(4);
  var bct = vec(8);
  var cat = vec(8);
  var abt = vec(8);
  var u2 = vec(4);
  var _8 = vec(8);
  var _8b = vec(8);
  var _16 = vec(16);
  var _12 = vec(12);
  var fin = vec(192);
  var fin2 = vec(192);

  // recovered-workspace/node_modules/robust-predicates/esm/incircle.js
  var iccerrboundA = (10 + 96 * epsilon) * epsilon;
  var iccerrboundB = (4 + 48 * epsilon) * epsilon;
  var iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
  var bc2 = vec(4);
  var ca2 = vec(4);
  var ab2 = vec(4);
  var aa = vec(4);
  var bb = vec(4);
  var cc = vec(4);
  var u3 = vec(4);
  var v = vec(4);
  var axtbc = vec(8);
  var aytbc = vec(8);
  var bxtca = vec(8);
  var bytca = vec(8);
  var cxtab = vec(8);
  var cytab = vec(8);
  var abt2 = vec(8);
  var bct2 = vec(8);
  var cat2 = vec(8);
  var abtt = vec(4);
  var bctt = vec(4);
  var catt = vec(4);
  var _82 = vec(8);
  var _162 = vec(16);
  var _16b = vec(16);
  var _16c = vec(16);
  var _32 = vec(32);
  var _32b = vec(32);
  var _48 = vec(48);
  var _64 = vec(64);
  var fin3 = vec(1152);
  var fin22 = vec(1152);

  // recovered-workspace/node_modules/robust-predicates/esm/insphere.js
  var isperrboundA = (16 + 224 * epsilon) * epsilon;
  var isperrboundB = (5 + 72 * epsilon) * epsilon;
  var isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
  var ab3 = vec(4);
  var bc3 = vec(4);
  var cd = vec(4);
  var de = vec(4);
  var ea = vec(4);
  var ac = vec(4);
  var bd = vec(4);
  var ce = vec(4);
  var da = vec(4);
  var eb = vec(4);
  var abc = vec(24);
  var bcd = vec(24);
  var cde = vec(24);
  var dea = vec(24);
  var eab = vec(24);
  var abd = vec(24);
  var bce = vec(24);
  var cda = vec(24);
  var deb = vec(24);
  var eac = vec(24);
  var adet = vec(1152);
  var bdet = vec(1152);
  var cdet = vec(1152);
  var ddet = vec(1152);
  var edet = vec(1152);
  var abdet = vec(2304);
  var cddet = vec(2304);
  var cdedet = vec(3456);
  var deter = vec(5760);
  var _83 = vec(8);
  var _8b2 = vec(8);
  var _8c = vec(8);
  var _163 = vec(16);
  var _24 = vec(24);
  var _482 = vec(48);
  var _48b = vec(48);
  var _96 = vec(96);
  var _192 = vec(192);
  var _384x = vec(384);
  var _384y = vec(384);
  var _384z = vec(384);
  var _768 = vec(768);
  var xdet = vec(96);
  var ydet = vec(96);
  var zdet = vec(96);
  var fin4 = vec(1152);

  // recovered-workspace/node_modules/delaunator/index.js
  var EPSILON = Math.pow(2, -52);
  var EDGE_STACK = new Uint32Array(512);
  var Delaunator = class _Delaunator {
    static from(points, getX = defaultGetX, getY = defaultGetY) {
      const n = points.length;
      const coords = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        const p = points[i];
        coords[2 * i] = getX(p);
        coords[2 * i + 1] = getY(p);
      }
      return new _Delaunator(coords);
    }
    constructor(coords) {
      const n = coords.length >> 1;
      if (n > 0 && typeof coords[0] !== "number") throw new Error("Expected coords to contain numbers.");
      this.coords = coords;
      const maxTriangles = Math.max(2 * n - 5, 0);
      this._triangles = new Uint32Array(maxTriangles * 3);
      this._halfedges = new Int32Array(maxTriangles * 3);
      this._hashSize = Math.ceil(Math.sqrt(n));
      this._hullPrev = new Uint32Array(n);
      this._hullNext = new Uint32Array(n);
      this._hullTri = new Uint32Array(n);
      this._hullHash = new Int32Array(this._hashSize);
      this._ids = new Uint32Array(n);
      this._dists = new Float64Array(n);
      this.update();
    }
    update() {
      const { coords, _hullPrev: hullPrev, _hullNext: hullNext, _hullTri: hullTri, _hullHash: hullHash } = this;
      const n = coords.length >> 1;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = coords[2 * i];
        const y = coords[2 * i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        this._ids[i] = i;
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      let i0, i1, i2;
      for (let i = 0, minDist = Infinity; i < n; i++) {
        const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
        if (d < minDist) {
          i0 = i;
          minDist = d;
        }
      }
      const i0x = coords[2 * i0];
      const i0y = coords[2 * i0 + 1];
      for (let i = 0, minDist = Infinity; i < n; i++) {
        if (i === i0) continue;
        const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
        if (d < minDist && d > 0) {
          i1 = i;
          minDist = d;
        }
      }
      let i1x = coords[2 * i1];
      let i1y = coords[2 * i1 + 1];
      let minRadius = Infinity;
      for (let i = 0; i < n; i++) {
        if (i === i0 || i === i1) continue;
        const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
        if (r < minRadius) {
          i2 = i;
          minRadius = r;
        }
      }
      let i2x = coords[2 * i2];
      let i2y = coords[2 * i2 + 1];
      if (minRadius === Infinity) {
        for (let i = 0; i < n; i++) {
          this._dists[i] = coords[2 * i] - coords[0] || coords[2 * i + 1] - coords[1];
        }
        quicksort(this._ids, this._dists, 0, n - 1);
        const hull = new Uint32Array(n);
        let j = 0;
        for (let i = 0, d0 = -Infinity; i < n; i++) {
          const id = this._ids[i];
          const d = this._dists[id];
          if (d > d0) {
            hull[j++] = id;
            d0 = d;
          }
        }
        this.hull = hull.subarray(0, j);
        this.triangles = new Uint32Array(0);
        this.halfedges = new Uint32Array(0);
        return;
      }
      if (orient2d(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {
        const i = i1;
        const x = i1x;
        const y = i1y;
        i1 = i2;
        i1x = i2x;
        i1y = i2y;
        i2 = i;
        i2x = x;
        i2y = y;
      }
      const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
      this._cx = center.x;
      this._cy = center.y;
      for (let i = 0; i < n; i++) {
        this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
      }
      quicksort(this._ids, this._dists, 0, n - 1);
      this._hullStart = i0;
      let hullSize = 3;
      hullNext[i0] = hullPrev[i2] = i1;
      hullNext[i1] = hullPrev[i0] = i2;
      hullNext[i2] = hullPrev[i1] = i0;
      hullTri[i0] = 0;
      hullTri[i1] = 1;
      hullTri[i2] = 2;
      hullHash.fill(-1);
      hullHash[this._hashKey(i0x, i0y)] = i0;
      hullHash[this._hashKey(i1x, i1y)] = i1;
      hullHash[this._hashKey(i2x, i2y)] = i2;
      this.trianglesLen = 0;
      this._addTriangle(i0, i1, i2, -1, -1, -1);
      for (let k = 0, xp, yp; k < this._ids.length; k++) {
        const i = this._ids[k];
        const x = coords[2 * i];
        const y = coords[2 * i + 1];
        if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
        xp = x;
        yp = y;
        if (i === i0 || i === i1 || i === i2) continue;
        let start = 0;
        for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
          start = hullHash[(key + j) % this._hashSize];
          if (start !== -1 && start !== hullNext[start]) break;
        }
        start = hullPrev[start];
        let e = start, q;
        while (q = hullNext[e], orient2d(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1]) >= 0) {
          e = q;
          if (e === start) {
            e = -1;
            break;
          }
        }
        if (e === -1) continue;
        let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
        hullTri[i] = this._legalize(t + 2);
        hullTri[e] = t;
        hullSize++;
        let n2 = hullNext[e];
        while (q = hullNext[n2], orient2d(x, y, coords[2 * n2], coords[2 * n2 + 1], coords[2 * q], coords[2 * q + 1]) < 0) {
          t = this._addTriangle(n2, i, q, hullTri[i], -1, hullTri[n2]);
          hullTri[i] = this._legalize(t + 2);
          hullNext[n2] = n2;
          hullSize--;
          n2 = q;
        }
        if (e === start) {
          while (q = hullPrev[e], orient2d(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1]) < 0) {
            t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
            this._legalize(t + 2);
            hullTri[q] = t;
            hullNext[e] = e;
            hullSize--;
            e = q;
          }
        }
        this._hullStart = hullPrev[i] = e;
        hullNext[e] = hullPrev[n2] = i;
        hullNext[i] = n2;
        hullHash[this._hashKey(x, y)] = i;
        hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
      }
      this.hull = new Uint32Array(hullSize);
      for (let i = 0, e = this._hullStart; i < hullSize; i++) {
        this.hull[i] = e;
        e = hullNext[e];
      }
      this.triangles = this._triangles.subarray(0, this.trianglesLen);
      this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
    }
    _hashKey(x, y) {
      return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
    }
    _legalize(a) {
      const { _triangles: triangles, _halfedges: halfedges, coords } = this;
      let i = 0;
      let ar = 0;
      while (true) {
        const b = halfedges[a];
        const a0 = a - a % 3;
        ar = a0 + (a + 2) % 3;
        if (b === -1) {
          if (i === 0) break;
          a = EDGE_STACK[--i];
          continue;
        }
        const b0 = b - b % 3;
        const al = a0 + (a + 1) % 3;
        const bl = b0 + (b + 2) % 3;
        const p0 = triangles[ar];
        const pr = triangles[a];
        const pl = triangles[al];
        const p1 = triangles[bl];
        const illegal = inCircle(
          coords[2 * p0],
          coords[2 * p0 + 1],
          coords[2 * pr],
          coords[2 * pr + 1],
          coords[2 * pl],
          coords[2 * pl + 1],
          coords[2 * p1],
          coords[2 * p1 + 1]
        );
        if (illegal) {
          triangles[a] = p1;
          triangles[b] = p0;
          const hbl = halfedges[bl];
          if (hbl === -1) {
            let e = this._hullStart;
            do {
              if (this._hullTri[e] === bl) {
                this._hullTri[e] = a;
                break;
              }
              e = this._hullPrev[e];
            } while (e !== this._hullStart);
          }
          this._link(a, hbl);
          this._link(b, halfedges[ar]);
          this._link(ar, bl);
          const br = b0 + (b + 1) % 3;
          if (i < EDGE_STACK.length) {
            EDGE_STACK[i++] = br;
          }
        } else {
          if (i === 0) break;
          a = EDGE_STACK[--i];
        }
      }
      return ar;
    }
    _link(a, b) {
      this._halfedges[a] = b;
      if (b !== -1) this._halfedges[b] = a;
    }
    // add a new triangle given vertex indices and adjacent half-edge ids
    _addTriangle(i0, i1, i2, a, b, c) {
      const t = this.trianglesLen;
      this._triangles[t] = i0;
      this._triangles[t + 1] = i1;
      this._triangles[t + 2] = i2;
      this._link(t, a);
      this._link(t + 1, b);
      this._link(t + 2, c);
      this.trianglesLen += 3;
      return t;
    }
  };
  function pseudoAngle(dx, dy) {
    const p = dx / (Math.abs(dx) + Math.abs(dy));
    return (dy > 0 ? 3 - p : 1 + p) / 4;
  }
  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }
  function inCircle(ax, ay, bx, by, cx, cy, px, py) {
    const dx = ax - px;
    const dy = ay - py;
    const ex = bx - px;
    const ey = by - py;
    const fx = cx - px;
    const fy = cy - py;
    const ap = dx * dx + dy * dy;
    const bp = ex * ex + ey * ey;
    const cp = fx * fx + fy * fy;
    return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
  }
  function circumradius(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;
    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const d = 0.5 / (dx * ey - dy * ex);
    const x = (ey * bl - dy * cl) * d;
    const y = (dx * cl - ex * bl) * d;
    return x * x + y * y;
  }
  function circumcenter(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;
    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const d = 0.5 / (dx * ey - dy * ex);
    const x = ax + (ey * bl - dy * cl) * d;
    const y = ay + (dx * cl - ex * bl) * d;
    return { x, y };
  }
  function quicksort(ids2, dists, left, right) {
    if (right - left <= 20) {
      for (let i = left + 1; i <= right; i++) {
        const temp = ids2[i];
        const tempDist = dists[temp];
        let j = i - 1;
        while (j >= left && dists[ids2[j]] > tempDist) ids2[j + 1] = ids2[j--];
        ids2[j + 1] = temp;
      }
    } else {
      const median = left + right >> 1;
      let i = left + 1;
      let j = right;
      swap(ids2, median, i);
      if (dists[ids2[left]] > dists[ids2[right]]) swap(ids2, left, right);
      if (dists[ids2[i]] > dists[ids2[right]]) swap(ids2, i, right);
      if (dists[ids2[left]] > dists[ids2[i]]) swap(ids2, left, i);
      const temp = ids2[i];
      const tempDist = dists[temp];
      while (true) {
        do
          i++;
        while (dists[ids2[i]] < tempDist);
        do
          j--;
        while (dists[ids2[j]] > tempDist);
        if (j < i) break;
        swap(ids2, i, j);
      }
      ids2[left + 1] = ids2[j];
      ids2[j] = temp;
      if (right - i + 1 >= j - left) {
        quicksort(ids2, dists, i, right);
        quicksort(ids2, dists, left, j - 1);
      } else {
        quicksort(ids2, dists, left, j - 1);
        quicksort(ids2, dists, i, right);
      }
    }
  }
  function swap(arr, i, j) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  function defaultGetX(p) {
    return p[0];
  }
  function defaultGetY(p) {
    return p[1];
  }

  // recovered-workspace/src/lib/avatar/arkit.ts
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
  var ARKIT_INDEX = Object.fromEntries(
    ARKIT_BLENDSHAPE_NAMES.map((name, index) => [name, index])
  );

  // recovered-workspace/src/lib/avatar/build-face.ts
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
  var EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  var EYE_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
  var BROW_A = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
  var BROW_B = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
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
  var LOWER_LIP = [17, 84, 181, 91, 146, 61, 185, 40, 39, 37, 18, 83, 314, 405, 321, 375, 291, 409, 270, 269, 267];
  var UPPER_LIP = [13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82];
  var NOSE = [1, 2, 4, 5, 6, 19, 94, 98, 327, 195, 197, 168];
  var JAW = [152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 377, 400, 378, 379, 365, 397, 288, 361, 323];
  var CHEEK_A = [116, 123, 147, 213, 192, 214, 212, 216, 205];
  var CHEEK_B = [345, 352, 376, 433, 416, 434, 432, 436, 425];
  var IRIS_A = [468, 469, 470, 471, 472];
  var IRIS_B = [473, 474, 475, 476, 477];
  function buildFace(landmarks, categories, source, mode) {
    const indices = triangulate(landmarks);
    let positions = layout(landmarks, mode);
    if (mode === "detail") {
      positions = smoothPositions(positions, indices, 2);
      inflateCheeks(positions);
    }
    const uvs = makeUvs(landmarks);
    const texture = makeTexture(source, landmarks, mode === "detail" ? 1.12 : 1.05);
    const amp = mode === "detail" ? 1.4 : 1;
    const morphs = buildMorphs(positions, amp);
    const influences = ARKIT_BLENDSHAPE_NAMES.map((name) => {
      const found = categories.find((row) => row.categoryName === name);
      return found?.score ?? 0;
    });
    return { positions, uvs, indices, morphs, influences, texture };
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
    const scale2 = 0.19 / Math.max(1e-4, maxX - minX);
    for (let i = 0; i < raw.length; i++) raw[i] = (raw[i] ?? 0) * scale2;
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
    let indices = collect(delaunay.triangles, landmarks, diag * 0.28);
    if (indices.length < 300) indices = collect(delaunay.triangles, landmarks, diag * 0.55);
    return indices;
  }
  function collect(triangles, landmarks, maxEdge) {
    const out = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t];
      const b = triangles[t + 1];
      const c = triangles[t + 2];
      if (dist2(landmarks[a], landmarks[b]) > maxEdge) continue;
      if (dist2(landmarks[b], landmarks[c]) > maxEdge) continue;
      if (dist2(landmarks[c], landmarks[a]) > maxEdge) continue;
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
  function dist2(a, b) {
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
    return { x: cx - size / 2, y: cy - size / 2, size };
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
    ctx.drawImage(
      source,
      crop.x * source.width,
      crop.y * source.height,
      crop.size * source.width,
      crop.size * source.height,
      0,
      0,
      size,
      size
    );
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
      const tri = [indices[t], indices[t + 1], indices[t + 2]];
      for (let k = 0; k < 3; k++) {
        const u4 = tri[k];
        const v2 = tri[(k + 1) % 3];
        if (u4 >= count || v2 >= count) continue;
        if (!seen[u4].has(v2)) {
          seen[u4].add(v2);
          neighbors[u4].push(v2);
        }
        if (!seen[v2].has(u4)) {
          seen[v2].add(u4);
          neighbors[v2].push(u4);
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
        const amount = 0.45;
        dst[i * 3] = (src[i * 3] ?? 0) * (1 - amount) + ax / m * amount;
        dst[i * 3 + 1] = (src[i * 3 + 1] ?? 0) * (1 - amount) + ay / m * amount;
        dst[i * 3 + 2] = (src[i * 3 + 2] ?? 0) * (1 - amount) + az / m * amount;
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
      const yn = (y - minY) / Math.max(1e-3, maxY - minY);
      if (ax > 0.025 && ax < 0.085 && yn > 0.25 && yn < 0.72) {
        const w = clamp(1 - Math.abs(ax - 0.05) / 0.04);
        pos[i * 3 + 2] = (pos[i * 3 + 2] ?? 0) + 0.012 * w;
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
    const smileLeft = (pos[61 * 3] ?? 0) >= (pos[291 * 3] ?? 0) ? 61 : 291;
    const smileRight = smileLeft === 61 ? 291 : 61;
    put("jawOpen", jawOpen(pos, amp));
    put("jawForward", ids(pos, JAW, 0, 0, 0.018 * amp));
    put("jawLeft", ids(pos, JAW, 0.016 * amp, 0, 0));
    put("jawRight", ids(pos, JAW, -0.016 * amp, 0, 0));
    put("mouthClose", lipClose(pos, amp));
    put("mouthFunnel", toward(pos, MOUTH, amp, 0.22, 0.016));
    put("mouthPucker", toward(pos, MOUTH, amp, 0.48, 0.01));
    put("mouthLeft", ids(pos, MOUTH, 0.012 * amp, 0, 0));
    put("mouthRight", ids(pos, MOUTH, -0.012 * amp, 0, 0));
    put("mouthSmileLeft", corner(pos, smileLeft, amp, 1));
    put("mouthSmileRight", corner(pos, smileRight, amp, -1));
    put("mouthFrownLeft", corner(pos, smileLeft, amp * 0.7, 0.2, -1));
    put("mouthFrownRight", corner(pos, smileRight, amp * 0.7, -0.2, -1));
    put("mouthDimpleLeft", corner(pos, smileLeft, amp * 0.45, 1, 0.2));
    put("mouthDimpleRight", corner(pos, smileRight, amp * 0.45, -1, 0.2));
    put("mouthStretchLeft", corner(pos, smileLeft, amp * 0.8, 1.4, -0.35));
    put("mouthStretchRight", corner(pos, smileRight, amp * 0.8, -1.4, -0.35));
    put("mouthRollLower", ids(pos, LOWER_LIP, 0, 8e-3 * amp, -8e-3 * amp));
    put("mouthRollUpper", ids(pos, UPPER_LIP, 0, -8e-3 * amp, -8e-3 * amp));
    put("mouthShrugLower", ids(pos, LOWER_LIP, 0, 0.012 * amp, 6e-3 * amp));
    put("mouthShrugUpper", ids(pos, UPPER_LIP, 0, 8e-3 * amp, 8e-3 * amp));
    put("mouthPressLeft", corner(pos, smileLeft, amp * 0.5, 0.3, -0.2));
    put("mouthPressRight", corner(pos, smileRight, amp * 0.5, -0.3, -0.2));
    put("mouthLowerDownLeft", corner(pos, smileLeft, amp * 0.55, 0.1, -1));
    put("mouthLowerDownRight", corner(pos, smileRight, amp * 0.55, -0.1, -1));
    put("mouthUpperUpLeft", ids(pos, UPPER_LIP, 0, 0.012 * amp, 4e-3 * amp));
    put("mouthUpperUpRight", ids(pos, UPPER_LIP, 0, 0.012 * amp, 4e-3 * amp));
    put("eyeBlinkLeft", blink(pos, eyes.high, amp, -1));
    put("eyeBlinkRight", blink(pos, eyes.low, amp, -1));
    put("eyeWideLeft", blink(pos, eyes.high, amp, 1));
    put("eyeWideRight", blink(pos, eyes.low, amp, 1));
    put("eyeSquintLeft", blink(pos, eyes.high, amp * 0.45, -1));
    put("eyeSquintRight", blink(pos, eyes.low, amp * 0.45, -1));
    put("eyeLookUpLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, 8e-3 * amp, 0));
    put("eyeLookDownLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, -8e-3 * amp, 0));
    put("eyeLookInLeft", ids(pos, iris.high.length ? iris.high : eyes.high, -6e-3 * amp, 0, 0));
    put("eyeLookOutLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 6e-3 * amp, 0, 0));
    put("eyeLookUpRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, 8e-3 * amp, 0));
    put("eyeLookDownRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, -8e-3 * amp, 0));
    put("eyeLookInRight", ids(pos, iris.low.length ? iris.low : eyes.low, 6e-3 * amp, 0, 0));
    put("eyeLookOutRight", ids(pos, iris.low.length ? iris.low : eyes.low, -6e-3 * amp, 0, 0));
    put("browDownLeft", ids(pos, brows.high, 0, -0.012 * amp, 0));
    put("browDownRight", ids(pos, brows.low, 0, -0.012 * amp, 0));
    put("browInnerUp", browInner(pos, [...brows.high, ...brows.low], amp));
    put("browOuterUpLeft", browOuter(pos, brows.high, amp));
    put("browOuterUpRight", browOuter(pos, brows.low, amp));
    put("cheekPuff", cheeksOut(pos, cheeks, amp));
    put("cheekSquintLeft", ids(pos, cheeks.high, 0, 8e-3 * amp, 6e-3 * amp));
    put("cheekSquintRight", ids(pos, cheeks.low, 0, 8e-3 * amp, 6e-3 * amp));
    put("noseSneerLeft", ids(pos, NOSE, 4e-3 * amp, 8e-3 * amp, 0));
    put("noseSneerRight", ids(pos, NOSE, -4e-3 * amp, 8e-3 * amp, 0));
    put("tongueOut", ids(pos, [13, 14, 17], 0, -0.01 * amp, 0.02 * amp));
    return morphs;
  }
  function jawOpen(pos, amp) {
    const buf = new Float32Array(pos.length);
    const lip = avgY(pos, [13, 14, 17, 0]);
    const chin = pos[152 * 3 + 1] ?? lip - 0.05;
    const span = Math.max(0.01, lip - chin);
    for (let i = 0; i < pos.length / 3; i++) {
      const y = pos[i * 3 + 1] ?? 0;
      if (y >= lip) continue;
      const t = clamp((lip - y) / span);
      buf[i * 3 + 1] = -0.05 * amp * t * t;
      buf[i * 3 + 2] = 0.012 * amp * t * t;
    }
    return buf;
  }
  function lipClose(pos, amp) {
    const buf = new Float32Array(pos.length);
    add(buf, pos, LOWER_LIP, 0, 0.012 * amp, 0);
    add(buf, pos, UPPER_LIP, 0, -8e-3 * amp, 0);
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
      const w = Math.max(0, 1 - d / 0.05);
      if (w === 0) continue;
      const e = w * w;
      buf[i * 3] = outward * 0.014 * amp * e;
      buf[i * 3 + 1] = up * 0.02 * amp * e;
      buf[i * 3 + 2] = 5e-3 * amp * e;
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
      const y = pos[o + 1] ?? 0;
      const above = y >= cy;
      const sign = above ? dir : dir * -0.25;
      buf[o + 1] = sign * 0.012 * amp;
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
      const w = clamp(1 - Math.abs(pos[o] ?? 0) / 0.05);
      buf[o + 1] = 0.016 * amp * w;
    }
    return buf;
  }
  function browOuter(pos, group, amp) {
    const buf = new Float32Array(pos.length);
    for (const i of group) {
      const o = i * 3;
      if (o + 1 >= pos.length) continue;
      const w = clamp((Math.abs(pos[o] ?? 0) - 0.02) / 0.05);
      buf[o + 1] = 0.014 * amp * w;
    }
    return buf;
  }
  function cheeksOut(pos, cheeks, amp) {
    const buf = new Float32Array(pos.length);
    add(buf, pos, cheeks.high, 0.012 * amp, 0, 0.01 * amp);
    add(buf, pos, cheeks.low, -0.012 * amp, 0, 0.01 * amp);
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
    return meanX(pos, a) >= meanX(pos, b) ? { high: a, low: b } : { high: b, low: a };
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
  function clamp(v2) {
    return Math.max(0, Math.min(1, v2));
  }
  function clampByte(v2) {
    return Math.max(0, Math.min(255, v2));
  }
  return __toCommonJS(face_builder_entry_exports);
})();
