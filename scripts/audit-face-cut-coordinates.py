#!/usr/bin/env python3
"""Audit AvatarAce GLB coordinate spaces before face-cut generation.

This tool is intentionally read-only: it does not edit or export production GLBs.
It reports glTF node transforms, skin joint locations, and transformed mesh bounds
so face-fit measurements can be reconciled with the correct coordinate space.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import trimesh
from pygltflib import GLTF2


def local_matrix(node) -> np.ndarray:
    if node.matrix and len(node.matrix) == 16:
        return np.asarray(node.matrix, dtype=float).reshape((4, 4), order="F")
    translation = np.asarray(node.translation or [0, 0, 0], dtype=float)
    rotation = np.asarray(node.rotation or [0, 0, 0, 1], dtype=float)
    scale = np.asarray(node.scale or [1, 1, 1], dtype=float)
    x, y, z, w = rotation
    rot = np.array([
        [1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
        [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
        [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)],
    ])
    result = np.eye(4)
    result[:3, :3] = rot @ np.diag(scale)
    result[:3, 3] = translation
    return result


def rounded(values):
    return np.round(np.asarray(values, dtype=float), 7).tolist()


def inspect(path: Path) -> dict:
    gltf = GLTF2().load(str(path))
    nodes = gltf.nodes or []
    parents = {}
    for parent_index, node in enumerate(nodes):
        for child_index in node.children or []:
            if child_index in parents:
                raise ValueError(f"Node {child_index} has multiple parents; hierarchy is invalid.")
            parents[child_index] = parent_index

    local = [local_matrix(node) for node in nodes]
    world: list[np.ndarray | None] = [None] * len(nodes)
    active = set()

    def world_matrix(index: int) -> np.ndarray:
        if world[index] is not None:
            return world[index]
        if index in active:
            raise ValueError(f"Cycle found in node hierarchy at index {index}.")
        active.add(index)
        parent = parents.get(index)
        world[index] = local[index] if parent is None else world_matrix(parent) @ local[index]
        active.remove(index)
        return world[index]

    names = [node.name or f"node_{i}" for i, node in enumerate(nodes)]
    joint_ids = set()
    for skin in gltf.skins or []:
        joint_ids.update(skin.joints or [])

    joint_rows = []
    for i in sorted(joint_ids):
        if i < 0 or i >= len(nodes):
            raise ValueError(f"Skin references out-of-range joint index {i}.")
        pos = world_matrix(i)[:3, 3]
        joint_rows.append({
            "index": i,
            "name": names[i],
            "local_translation": rounded(nodes[i].translation or [0, 0, 0]),
            "world_position": rounded(pos),
        })

    scene = trimesh.load(str(path), force="scene", process=False)
    mesh_rows = []
    for node_name in scene.graph.nodes_geometry:
        transform, geometry_name = scene.graph.get(node_name)
        geometry = scene.geometry.get(geometry_name)
        if geometry is None or not hasattr(geometry, "vertices") or not len(geometry.vertices):
            continue
        vertices = trimesh.transform_points(np.asarray(geometry.vertices), transform)
        bounds = np.vstack((vertices.min(axis=0), vertices.max(axis=0)))
        mesh_rows.append({
            "node": str(node_name),
            "geometry": str(geometry_name),
            "vertex_count": int(len(geometry.vertices)),
            "face_count": int(len(getattr(geometry, "faces", []))),
            "scene_bounds_min": rounded(bounds[0]),
            "scene_bounds_max": rounded(bounds[1]),
        })

    head_like = [row for row in joint_rows if any(
        term in row["name"].lower()
        for term in ("head", "neck", "jaw", "eye", "nose", "mouth", "face")
    )]
    head_exact = [row for row in joint_rows if row["name"] == "head"]
    return {
        "file": str(path),
        "node_count": len(nodes),
        "skin_count": len(gltf.skins or []),
        "skin_joint_count_unique": len(joint_ids),
        "exact_head_joint_count": len(head_exact),
        "head_joint_contract_ok": len(head_exact) == 1,
        "scene_meshes": mesh_rows,
        "head_related_joints": head_like,
        "all_skin_joints": joint_rows,
        "warnings": ([] if len(head_exact) == 1 else [
            f'Expected exactly one joint named "head"; found {len(head_exact)}.'
        ]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("models", nargs="+", type=Path, help="Input GLB model paths")
    parser.add_argument("--output", type=Path, default=Path("face-cut-coordinate-audit.json"))
    args = parser.parse_args()

    reports = []
    failed = False
    for path in args.models:
        if not path.is_file():
            reports.append({"file": str(path), "error": "File not found"})
            failed = True
            continue
        try:
            report = inspect(path)
            reports.append(report)
            failed = failed or not report["head_joint_contract_ok"]
        except Exception as exc:
            reports.append({"file": str(path), "error": f"{type(exc).__name__}: {exc}"})
            failed = True

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "purpose": "Read-only coordinate-space and rig audit; no GLB is modified.",
        "models": reports,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote audit: {args.output}")
    for report in reports:
        if "error" in report:
            print(f"FAIL {report['file']}: {report['error']}")
        else:
            print(
                f"{'PASS' if report['head_joint_contract_ok'] else 'FAIL'} "
                f"{report['file']}: nodes={report['node_count']}, "
                f"meshes={len(report['scene_meshes'])}, "
                f"unique_skin_joints={report['skin_joint_count_unique']}, "
                f'exact_head_joints={report["exact_head_joint_count"]}'
            )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
