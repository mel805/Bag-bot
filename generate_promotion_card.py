import io
import os
import requests
from typing import Tuple, List
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
FONTS_DIR = os.path.join(ASSETS_DIR, "fonts")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Prefer variable fonts, with static alternatives as fallback
CINZEL_URLS: List[str] = [
	"https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf",
	"https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-VariableFont_wght.ttf",
	"https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-Regular.ttf"
]
CORMORANT_URLS: List[str] = [
	"https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
	"https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-VariableFont_wght.ttf",
	"https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf"
]

GOLD_COLORS = [
	(182, 140, 45),
	(241, 217, 138),
	(143, 110, 41)
]


def ensure_dir(path: str) -> None:
	if not os.path.exists(path):
		os.makedirs(path, exist_ok=True)


def download_once(url: str, dest_path: str) -> str:
	ensure_dir(os.path.dirname(dest_path))
	if not os.path.exists(dest_path):
		resp = requests.get(url, timeout=30)
		resp.raise_for_status()
		with open(dest_path, "wb") as f:
			f.write(resp.content)
	return dest_path


def download_first_available(urls: List[str], dest_path: str) -> str:
	last_err: Exception | None = None
	for url in urls:
		try:
			return download_once(url, dest_path)
		except Exception as e:
			last_err = e
			continue
	if last_err:
		raise last_err
	return dest_path


def load_font(ttf_path: str, size: int) -> ImageFont.FreeTypeFont:
	return ImageFont.truetype(ttf_path, size=size)


def create_radial_vignette(width: int, height: int, inner_alpha: int = 0, outer_alpha: int = 220) -> Image.Image:
	cx, cy = width / 2.0, height / 2.0
	y, x = np.ogrid[:height, :width]
	dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
	max_dist = np.sqrt(cx ** 2 + cy ** 2)
	norm = (dist / max_dist)
	alpha = inner_alpha + (outer_alpha - inner_alpha) * norm
	alpha = np.clip(alpha, inner_alpha, outer_alpha).astype(np.uint8)
	mask = Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(8))
	vignette = Image.new("RGBA", (width, height), (0, 0, 0, 0))
	dark = Image.new("RGBA", (width, height), (0, 0, 0, 255))
	vignette = Image.composite(dark, vignette, mask)
	return vignette


def draw_gold_gradient(size: Tuple[int, int], horizontal: bool = False) -> Image.Image:
	w, h = size
	grad = Image.new("RGB", (w, h))
	draw = ImageDraw.Draw(grad)
	for i in range(w if horizontal else h):
		t = i / float((w - 1) if horizontal else (h - 1))
		if t <= 0.5:
			t2 = t / 0.5
			c0 = GOLD_COLORS[0]
			c1 = GOLD_COLORS[1]
		else:
			t2 = (t - 0.5) / 0.5
			c0 = GOLD_COLORS[1]
			c1 = GOLD_COLORS[2]
		r = int(c0[0] + (c1[0] - c0[0]) * t2)
		g = int(c0[1] + (c1[1] - c0[1]) * t2)
		b = int(c0[2] + (c1[2] - c0[2]) * t2)
		if horizontal:
			draw.line([(i, 0), (i, h)], fill=(r, g, b))
		else:
			draw.line([(0, i), (w, i)], fill=(r, g, b))
	return grad


def draw_text_with_gold(image: Image.Image, text: str, font: ImageFont.FreeTypeFont, position: Tuple[int, int], anchor: str = "mm", shadow: bool = True) -> None:
	draw = ImageDraw.Draw(image)
	bbox = draw.textbbox((0, 0), text, font=font, anchor="lt")
	text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
	mask = Image.new("L", (text_w, text_h), 0)
	mdraw = ImageDraw.Draw(mask)
	mdraw.text((0, 0), text, font=font, fill=255)

	grad = draw_gold_gradient((text_w, text_h), horizontal=False)
	textured = Image.composite(grad, Image.new("RGB", (text_w, text_h), (0, 0, 0)), mask)

	if shadow:
		shadow_img = Image.new("RGBA", (text_w + 8, text_h + 8), (0, 0, 0, 0))
		s_mask = mask.filter(ImageFilter.GaussianBlur(4))
		shadow_img.paste((0, 0, 0, 80), (4, 4), s_mask)
		px, py = position
		tl = anchor_to_topleft((text_w + 8, text_h + 8), (px, py), anchor)
		image.alpha_composite(shadow_img, dest=tl)

	text_rgba = textured.convert("RGBA")
	text_rgba.putalpha(mask)
	px, py = position
	tl = anchor_to_topleft((text_w, text_h), (px, py), anchor)
	image.alpha_composite(text_rgba, dest=tl)


def anchor_to_topleft(size: Tuple[int, int], position: Tuple[int, int], anchor: str) -> Tuple[int, int]:
	w, h = size
	x, y = position
	ax = anchor[0]
	ay = anchor[1]
	if ax == 'l':
		tx = x
	elif ax == 'm':
		tx = x - w // 2
	elif ax == 'r':
		tx = x - w
	else:
		tx = x - w // 2
	if ay == 't':
		ty = y
	elif ay == 'm':
		ty = y - h // 2
	elif ay == 'b':
		ty = y - h
	else:
		ty = y - h // 2
	return (tx, ty)


def draw_gold_rect_border(draw: ImageDraw.ImageDraw, rect: Tuple[int, int, int, int], width: int = 6) -> None:
	x0, y0, x1, y1 = rect
	avg = (int(sum(c[0] for c in GOLD_COLORS) / 3), int(sum(c[1] for c in GOLD_COLORS) / 3), int(sum(c[2] for c in GOLD_COLORS) / 3))
	for widx in range(width):
		draw.rectangle((x0 + widx, y0 + widx, x1 - widx, y1 - widx), outline=avg)


def draw_diamond(draw: ImageDraw.ImageDraw, center: Tuple[int, int], size: int, fill: Tuple[int, int, int]):
	cx, cy = center
	s = size // 2
	points = [(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)]
	draw.polygon(points, fill=fill)


def draw_crown(draw: ImageDraw.ImageDraw, bbox: Tuple[int, int, int, int], fill: Tuple[int, int, int]):
	x0, y0, x1, y1 = bbox
	w = x1 - x0
	h = y1 - y0
	base_h = int(h * 0.35)
	draw.rectangle([x0, y1 - base_h, x1, y1], fill=fill)
	spike_w = w // 3
	for i in range(3):
		sx0 = x0 + i * spike_w
		sx1 = sx0 + spike_w
		peak_x = (sx0 + sx1) // 2
		peak_y = y0
		draw.polygon([(sx0, y1 - base_h), (peak_x, peak_y), (sx1, y1 - base_h)], fill=fill)


def circle_mask(size: int) -> Image.Image:
	m = Image.new("L", (size, size), 0)
	d = ImageDraw.Draw(m)
	d.ellipse((0, 0, size, size), fill=255)
	return m


def fetch_image(url: str, target_size: int) -> Image.Image:
	resp = requests.get(url, timeout=30)
	resp.raise_for_status()
	img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
	w, h = img.size
	side = min(w, h)
	left = (w - side) // 2
	top = (h - side) // 2
	img = img.crop((left, top, left + side, top + side)).resize((target_size, target_size), Image.LANCZOS)
	m = circle_mask(target_size)
	out = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
	out.paste(img, (0, 0), m)
	return out


def generate_card(member_name: str, level_text: str, role_text: str, logo_url: str, output_path: str) -> None:
	width, height = 1920, 1080
	ensure_dir(OUTPUT_DIR)
	ensure_dir(FONTS_DIR)

	cinzel_path = download_first_available(CINZEL_URLS, os.path.join(FONTS_DIR, "Cinzel.ttf"))
	cormorant_path = download_first_available(CORMORANT_URLS, os.path.join(FONTS_DIR, "CormorantGaramond.ttf"))

	img = Image.new("RGBA", (width, height), (11, 11, 11, 255))

	vignette = create_radial_vignette(width, height, inner_alpha=0, outer_alpha=180)
	img.alpha_composite(vignette)

	draw = ImageDraw.Draw(img)

	padding_outer = 20
	padding_inner = 40
	draw_gold_rect_border(draw, (padding_outer, padding_outer, width - padding_outer, height - padding_outer), width=4)
	draw_gold_rect_border(draw, (padding_outer + padding_inner, padding_outer + padding_inner, width - padding_outer - padding_inner, height - padding_outer - padding_inner), width=2)

	gold_avg = (int(sum(c[0] for c in GOLD_COLORS) / 3), int(sum(c[1] for c in GOLD_COLORS) / 3), int(sum(c[2] for c in GOLD_COLORS) / 3))
	crown_size = 70
	margin_crown = 80
	draw_crown(draw, (padding_outer + margin_crown - crown_size // 2, padding_outer + 18, padding_outer + margin_crown - crown_size // 2 + crown_size, padding_outer + 18 + crown_size), fill=gold_avg)
	draw_crown(draw, (width - padding_outer - margin_crown - crown_size // 2, padding_outer + 18, width - padding_outer - margin_crown - crown_size // 2 + crown_size, padding_outer + 18 + crown_size), fill=gold_avg)

	title_font = load_font(cinzel_path, 110)
	draw_text_with_gold(img, "PROMOTION DE PRESTIGE", title_font, (width // 2, 160), anchor="mm", shadow=True)

	name_font = load_font(cinzel_path, 78)
	sub_font = load_font(cormorant_path, 46)
	level_font = load_font(cinzel_path, 64)
	dist_font = load_font(cormorant_path, 54)

	draw_text_with_gold(img, member_name, name_font, (width // 2, 320), anchor="mm", shadow=True)
	draw_text_with_gold(img, "vient de franchir un nouveau cap !", sub_font, (width // 2, 390), anchor="mm", shadow=False)

	draw_text_with_gold(img, f"Niveau atteint : {level_text}", level_font, (width // 2, 470), anchor="mm", shadow=True)
	draw_text_with_gold(img, f"Dernière distinction : {role_text}", dist_font, (width // 2, 540), anchor="mm", shadow=True)

	med_size = 520
	med_center = (width // 2, 720)

	ring_img = Image.new("RGBA", (med_size, med_size), (0, 0, 0, 0))
	ring_draw = ImageDraw.Draw(ring_img)
	ring_draw.ellipse((0, 0, med_size - 1, med_size - 1), fill=None, outline=gold_avg, width=18)

	try:
		logo = fetch_image(logo_url, med_size - 60)
	except Exception:
		logo = Image.new("RGBA", (med_size - 60, med_size - 60), (0, 0, 0, 0))
		ld = ImageDraw.Draw(logo)
		ld.ellipse((0, 0, med_size - 60, med_size - 60), outline=gold_avg, width=6)

	ring_img.alpha_composite(logo, dest=(30, 30))
	img.alpha_composite(ring_img, dest=(med_center[0] - med_size // 2, med_center[1] - med_size // 2))

	congrats_font = load_font(cinzel_path, 80)
	strap_font = load_font(cinzel_path, 40)

	draw_text_with_gold(img, "Félicitations !", congrats_font, (width // 2, 865), anchor="mm", shadow=True)

	draw_diamond(draw, (120, height - 70), 40, fill=gold_avg)
	draw_diamond(draw, (width - 120, height - 70), 40, fill=gold_avg)

	draw_text_with_gold(img, "CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES", strap_font, (width // 2, height - 70), anchor="mm", shadow=False)

	img = img.convert("RGB")

	img.save(output_path, format="PNG", optimize=True)


if __name__ == "__main__":
	import argparse

	parser = argparse.ArgumentParser(description="Generate prestige promotion card")
	parser.add_argument("--name", required=False, default="Nom du Membre")
	parser.add_argument("--level", required=False, default="X")
	parser.add_argument("--role", required=False, default="Dernier Rôle")
	parser.add_argument("--logo_url", required=True)
	parser.add_argument("--out", default=os.path.join(OUTPUT_DIR, "promotion_card.png"))

	args = parser.parse_args()

	ensure_dir(OUTPUT_DIR)
	generate_card(args.name, args.level, args.role, args.logo_url, args.out)
	print(f"Saved -> {args.out}")