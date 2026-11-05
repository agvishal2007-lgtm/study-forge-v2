import sys, io, os
from PIL import Image, ImageDraw, ImageFont
import img2pdf

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]
FONT = next((p for p in CANDIDATES if os.path.exists(p)), None)
if FONT is None:
    raise SystemExit("No DejaVu font found for test fixtures")

def text_image(lines, size=48, pad=60, w=1400):
    font = ImageFont.truetype(FONT, size)
    h = pad*2 + len(lines)*(size+18)
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    y = pad
    for line in lines:
        d.text((pad, y), line, fill="black", font=font)
        y += size+18
    return img

# A photo-like image with clear words.
text_image(["Biology 101 study photo", "Photosynthesis happens in the chloroplast", "thylakoid membranes capture light"]).save(os.path.join(out, "scan.png"))

# A scanned PDF: the page is an image of text, with no text layer underneath.
page = text_image(["Microeconomics Chapter 4", "Price elasticity of demand", "Markets reach equilibrium where supply meets demand"])
buf = io.BytesIO(); page.save(buf, format="PNG")
with open(os.path.join(out, "scanned.pdf"), "wb") as f:
    f.write(img2pdf.convert(buf.getvalue()))
print("made", os.listdir(out))
