#!/usr/bin/env python3
"""Import the supplied image mapping and create compact, uncropped WebP assets (Pillow required)."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path, help='Directory containing images.json and images/')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / 'public/species-images'
output.mkdir(exist_ok=True)
source = json.loads((args.source / 'images.json').read_text())
ids = {s['id'] for catalog in (root / 'src/config/species').glob('*.json') for s in json.loads(catalog.read_text())['species']}
manifest = {}
original_bytes = 0
for entry in source['images']:
    if entry['id'] not in ids or not entry.get('localPath'):
        continue
    src = (args.source / entry['localPath']).resolve()
    if not src.is_relative_to(args.source.resolve()) or not src.is_file():
        raise ValueError(f'Invalid image path: {src}')
    with Image.open(src) as raw:
        image = ImageOps.exif_transpose(raw).convert('RGB')
        image.thumbnail((768, 768), Image.Resampling.LANCZOS)
        dest = output / (entry['id'] + '.webp')
        image.save(dest, 'WEBP', quality=74, method=6)
        width, height = image.size
    original_bytes += src.stat().st_size
    metadata = {key: entry.get(key, '') for key in ['title', 'author', 'authorUrl', 'requiredAttribution', 'source', 'sourceUrl', 'originalSource', 'originalSourceUrl', 'license', 'licenseUrl', 'publicDomainBasis', 'shareAlike', 'attribution']}
    metadata.update(url=f"species-images/{dest.name}", width=width, height=height,
                    modifications='; '.join(filter(None, [entry.get('modifications'), 'Auf maximal 768 × 768 Pixel verkleinert und als WebP komprimiert; nicht beschnitten.'])))
    manifest[entry['id']] = metadata
(output / 'attribution.json').write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
compressed_bytes = sum((output / (key + '.webp')).stat().st_size for key in manifest)
print(f'{len(manifest)} images: {original_bytes:,} -> {compressed_bytes:,} bytes ({100*(1-compressed_bytes/original_bytes):.1f}% smaller)')
