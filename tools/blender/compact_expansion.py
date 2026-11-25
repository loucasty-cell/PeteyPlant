"""Re-export expansion GLBs without reopening or resaving their editable masters."""

import argparse
import json
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from expansion_common import export_runtime, glb_stats

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    for path in sorted((ROOT / "assets/characters").glob("*/spec.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        if "stageScale" not in spec or (args.only and spec["id"] not in args.only):
            continue
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / spec["source"]), use_scripts=False)
        crown = bpy.context.scene.objects["Foliage sway"]
        runtime = ROOT / spec["runtime"]
        before_bytes, before_triangles, before_primitives = glb_stats(runtime)
        candidate = runtime.with_suffix(".candidate.glb")
        after_bytes, triangles, primitives = export_runtime(crown.parent, candidate)
        if triangles != before_triangles:
            raise ValueError(f"{spec['id']}: compaction changed triangle count ({before_triangles} to {triangles})")
        if primitives <= before_primitives and after_bytes <= before_bytes:
            candidate.replace(runtime)
        else:
            candidate.unlink()
            after_bytes, primitives = before_bytes, before_primitives
        spec.update(glbBytes=after_bytes, triangles=triangles, runtimePrimitives=primitives)
        path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"PETEY COMPACT {spec['id']} {before_primitives} to {primitives} primitives; "
              f"{before_bytes} to {after_bytes} bytes", flush=True)


if __name__ == "__main__":
    main()
