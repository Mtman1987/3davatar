#!/usr/bin/env python3
"""
CLI runner for Humanoid-Face-3D reconstruction.
Supports single or multiple input photos and configurable detail level (0-100).
"""
import argparse
import sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.pipeline import FaceGeoPipeline


def main():
    parser = argparse.ArgumentParser(
        description="Reconstruct a high-detail 3D humanoid head mesh from 1–5 photos."
    )
    parser.add_argument(
        "--photos",
        nargs="+",
        required=True,
        help="Path(s) to 1–5 portrait photos (e.g. front.jpg left.jpg right.jpg).",
    )
    parser.add_argument(
        "--output",
        "-o",
        required=True,
        help="Directory to save output 3D meshes and maps.",
    )
    parser.add_argument(
        "--config",
        "-c",
        default=str(ROOT / "configs" / "default.yaml"),
        help="Path to YAML config file (default: configs/default.yaml).",
    )
    parser.add_argument(
        "--detail",
        "-d",
        type=int,
        default=None,
        help="Detail level (0–100). 0=base mesh, 75=deep wrinkles/pores, 100=studio sculpt.",
    )

    args = parser.parse_args()

    with open(args.config, "r") as f:
        cfg = yaml.safe_load(f)

    import os
    mounted_models = Path(os.environ.get("FACE_MODEL_DIR", ""))
    if mounted_models.is_dir():
        flame_cfg = cfg.setdefault("flame", {})
        for config_key, file_name in (
            ("model", "flame2023_open.pkl"),
            ("region_masks", "region_masks_open.npz"),
            ("uv_layout", "uv_layout_open.npz"),
        ):
            candidate = mounted_models / file_name
            if candidate.is_file():
                flame_cfg[config_key] = str(candidate)
        embedding = mounted_models / "mediapipe_embedding_open.npz"
        if embedding.is_file():
            cfg.setdefault("stage2", {})["mediapipe_embedding"] = str(embedding)

    if args.detail is not None:
        cfg.setdefault("stage3", {})["detail_level"] = max(0, min(100, args.detail))

    # The hosted CPU service does not require Blender. Keep its optional clay preview
    # out of the production job; geometry, textures, PBR maps, and Stage 5 still run.
    if os.environ.get("FACE_RECONSTRUCTION_SKIP_CLAY", "").lower() in {"1", "true", "yes"}:
        cfg.setdefault("evaluation", {})["clay_renders"] = False

    pipeline = FaceGeoPipeline(cfg=cfg)
    manifest = pipeline.run(args.photos, args.output)

    print("\n" + "=" * 60)
    print("✅ Reconstruction Complete!")
    print(f"📁 Output directory: {args.output}")
    print(f"🗿 High-detail 3D mesh: {Path(args.output) / 'head_mesh_detail.obj'}")
    print(f"🗿 Clean base mesh:     {Path(args.output) / 'head_mesh.obj'}")
    print(f"🗺️  16-bit displacement: {Path(args.output) / 'film_displacement_16bit.png'}")
    print(f"🗺️  Normal map:          {Path(args.output) / 'film_normal.png'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
