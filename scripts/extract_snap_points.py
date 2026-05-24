#!/usr/bin/env python3
"""Extract red snap-point circles from variation SVGs into snapPoints.json."""

from __future__ import annotations

import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SVG_NS = "http://www.w3.org/2000/svg"
SVG_TAG = f"{{{SVG_NS}}}"

ROOT = Path(__file__).resolve().parents[1]
SVG_DIR = ROOT / "public" / "2d"
OUTPUT_PATH = ROOT / "src" / "lib" / "decode" / "snapPoints.json"
VARIATION_COUNT = 70


def parse_length(value: str | None) -> float:
    if not value:
        return 0.0
    cleaned = re.sub(r"[^0-9.+-]", "", value.strip())
    return float(cleaned) if cleaned else 0.0


def parse_viewbox(root: ET.Element) -> tuple[float, float, float, float]:
    viewbox = root.get("viewBox")
    if viewbox:
        parts = [float(part) for part in re.split(r"[,\s]+", viewbox.strip()) if part]
        if len(parts) == 4:
            return parts[0], parts[1], parts[2], parts[3]

    width = parse_length(root.get("width"))
    height = parse_length(root.get("height"))
    if width <= 0 or height <= 0:
        raise ValueError("SVG has no usable viewBox or width/height")
    return 0.0, 0.0, width, height


def parse_style(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    props: dict[str, str] = {}
    for chunk in style.split(";"):
        if ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        props[key.strip().lower()] = value.strip()
    return props


def parse_class_fills(root: ET.Element) -> dict[str, str]:
    """Map CSS class names (e.g. cls-2) to fill values from embedded <style> blocks."""
    class_fills: dict[str, str] = {}
    for style_el in root.iter(SVG_TAG + "style"):
        text = style_el.text or ""
        for rule in re.finditer(r"([^{]+)\{([^}]+)\}", text):
            declarations = parse_style(rule.group(2).replace("\n", " "))
            fill = declarations.get("fill")
            if not fill:
                continue
            for selector in rule.group(1).split(","):
                match = re.fullmatch(r"\.(cls-\d+)", selector.strip())
                if match:
                    class_fills[match.group(1)] = fill
    return class_fills


def get_fill(element: ET.Element, class_fills: dict[str, str]) -> str | None:
    fill = element.get("fill")
    if fill:
        return fill
    inline = parse_style(element.get("style"))
    if "fill" in inline:
        return inline["fill"]
    resolved: str | None = None
    for class_name in (element.get("class") or "").split():
        if class_name in class_fills:
            resolved = class_fills[class_name]
    return resolved


def is_red_fill(value: str | None) -> bool:
    if not value:
        return False

    normalized = value.strip().lower()
    if normalized in {"none", "transparent"}:
        return False
    if normalized == "red":
        return True
    if normalized in {"#ff0000", "#f00"}:
        return True

    hex_match = re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", normalized)
    if hex_match:
        digits = hex_match.group(1)
        if len(digits) == 3:
            r, g, b = (int(d * 2, 16) for d in digits)
        else:
            r = int(digits[0:2], 16)
            g = int(digits[2:4], 16)
            b = int(digits[4:6], 16)
        return r >= 200 and g <= 50 and b <= 50

    rgb_match = re.fullmatch(
        r"rgb\s*\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*\)",
        normalized,
    )
    if rgb_match:
        channels = []
        for channel in rgb_match.groups():
            if channel.endswith("%"):
                channels.append(float(channel[:-1]) / 100.0)
            else:
                numeric = float(channel)
                channels.append(numeric / 255.0 if numeric > 1 else numeric)
        r, g, b = channels
        return r >= 0.78 and g <= 0.2 and b <= 0.2

    return False


def multiply(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, ...]:
    return (
        a[0] * b[0] + a[2] * b[1] + a[4],
        a[1] * b[0] + a[3] * b[1] + a[5],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    )


def identity() -> tuple[float, ...]:
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def parse_transform(value: str | None) -> tuple[float, ...]:
    if not value:
        return identity()

    matrix = identity()
    for command in re.finditer(
        r"(matrix|translate|scale|rotate)\s*\(([^)]*)\)",
        value,
        flags=re.IGNORECASE,
    ):
        name = command.group(1).lower()
        args = [float(part) for part in re.split(r"[,\s]+", command.group(2).strip()) if part]

        if name == "matrix" and len(args) == 6:
            step = tuple(args)
        elif name == "translate":
            tx = args[0] if args else 0.0
            ty = args[1] if len(args) > 1 else 0.0
            step = (1.0, 0.0, 0.0, 1.0, tx, ty)
        elif name == "scale":
            sx = args[0] if args else 1.0
            sy = args[1] if len(args) > 1 else sx
            step = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        elif name == "rotate":
            angle = args[0] if args else 0.0
            radians = angle * 3.141592653589793 / 180.0
            cos_a = math.cos(radians)
            sin_a = math.sin(radians)
            if len(args) >= 3:
                cx, cy = args[1], args[2]
                step = multiply(
                    (1.0, 0.0, 0.0, 1.0, cx, cy),
                    (cos_a, sin_a, -sin_a, cos_a, -cx, -cy),
                )
            else:
                step = (cos_a, sin_a, -sin_a, cos_a, 0.0, 0.0)
        else:
            continue

        matrix = multiply(matrix, step)

    return matrix


def apply_transform(matrix: tuple[float, ...], x: float, y: float) -> tuple[float, float]:
    return (
        matrix[0] * x + matrix[2] * y + matrix[4],
        matrix[1] * x + matrix[3] * y + matrix[5],
    )


def collect_red_circles(
    element: ET.Element,
    parent_transform: tuple[float, ...],
    class_fills: dict[str, str],
) -> list[tuple[float, float]]:
    transform = multiply(parent_transform, parse_transform(element.get("transform")))
    points: list[tuple[float, float]] = []

    tag = element.tag
    if tag == SVG_TAG + "circle" and is_red_fill(get_fill(element, class_fills)):
        cx = float(element.get("cx", "0"))
        cy = float(element.get("cy", "0"))
        points.append(apply_transform(transform, cx, cy))

    for child in element:
        points.extend(collect_red_circles(child, transform, class_fills))

    return points


def svg_path_for_index(index: int) -> Path | None:
    for name in (f"v-{index:02d}.svg", f"v{index:02d}.svg"):
        candidate = SVG_DIR / name
        if candidate.exists():
            return candidate
    return None


def normalize_points(
    points: list[tuple[float, float]],
    viewbox: tuple[float, float, float, float],
) -> list[dict[str, float]]:
    min_x, min_y, width, height = viewbox
    if width <= 0 or height <= 0:
        raise ValueError("viewBox width/height must be positive")

    normalized = [
        {
            "x": round((x - min_x) / width, 4),
            "y": round((y - min_y) / height, 4),
        }
        for x, y in points
    ]
    normalized.sort(key=lambda point: (point["y"], point["x"]))
    return normalized


def output_key_for_path(path: Path) -> str:
    stem = path.stem
    if stem.startswith("v-") or re.fullmatch(r"v\d{2}", stem):
        return stem if stem.startswith("v-") else f"v-{stem[1:]}"
    return stem


def main() -> int:
    if not SVG_DIR.is_dir():
        print(f"ERROR: SVG directory not found: {SVG_DIR}", file=sys.stderr)
        return 1

    result: dict[str, list[dict[str, float]]] = {}
    zero_red: list[str] = []
    missing: list[str] = []
    errors: list[str] = []

    for index in range(VARIATION_COUNT):
        key = f"v-{index:02d}"
        svg_path = svg_path_for_index(index)
        if svg_path is None:
            missing.append(key)
            continue

        try:
            tree = ET.parse(svg_path)
            root = tree.getroot()
            viewbox = parse_viewbox(root)
            class_fills = parse_class_fills(root)
            points = collect_red_circles(root, identity(), class_fills)
            normalized = normalize_points(points, viewbox)
            result[output_key_for_path(svg_path)] = normalized
            if not normalized:
                zero_red.append(key)
        except Exception as exc:  # noqa: BLE001 - report per-file failures
            errors.append(f"{key}: {exc}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")

    print(f"Wrote {OUTPUT_PATH} ({len(result)} variations)")

    if missing:
        print(f"\nMissing SVG files ({len(missing)}):")
        for key in missing:
            print(f"  - {key}")

    if zero_red:
        print(f"\nVariations with zero red circles ({len(zero_red)}):")
        for key in zero_red:
            print(f"  - {key}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for message in errors:
            print(f"  - {message}")
        return 1

    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
