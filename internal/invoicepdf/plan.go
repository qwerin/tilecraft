package invoicepdf

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/jpeg"
	"net/http"

	"github.com/go-pdf/fpdf"
)

// Plan is a laying plan (kladečský plán) printed at the end of a quote.
type Plan struct {
	Name string
	Data []byte // PNG, JPEG or GIF is drawn; other files (a PDF) are only named
}

// maxPlanSide bounds the longer side of a rotated JPEG (px, ~340 dpi across the page).
const maxPlanSide = 2400

// plans draws „Kladečský plán“: every image scaled to the page width (and the
// rest of the page), files that are not images are named with the link.
func (d *doc) plans(plans []Plan, url string) {
	var files []string
	first := true
	head := func() {
		d.font("B", 11, cAccent)
		d.SetX(margin)
		d.CellFormat(width, 7, "Kladečský plán", "", 1, "L", false, 0, "")
		d.Ln(1)
	}
	for i, p := range plans {
		data, tp := planImage(p.Data)
		if tp == "" {
			files = append(files, p.Name)
			continue
		}
		name := fmt.Sprintf("plan%d", i)
		info := d.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: tp}, bytes.NewReader(data))
		if d.Err() || info == nil || info.Width() <= 0 || info.Height() <= 0 {
			d.ClearError() // unsupported variant (interlaced PNG, CMYK JPEG): named instead
			files = append(files, p.Name)
			continue
		}
		// each plan on its own page, as large as it fits
		d.newPage()
		head()
		first = false
		top := d.GetY()
		maxH := d.pageH - bottom - top - lh - 2
		w, h := info.Width(), info.Height()
		scale := min(width/w, maxH/h)
		w, h = w*scale, h*scale
		d.ImageOptions(name, margin+(width-w)/2, top, w, h, false, fpdf.ImageOptions{ImageType: tp}, 0, "")
		d.SetY(top + h + 1)
		d.font("", small, cGrey)
		d.CellFormat(width, lh, p.Name, "", 1, "C", false, 0, "")
	}
	if len(files) == 0 {
		return
	}
	if first {
		d.ensure(7 + 2*lh)
		d.SetY(d.GetY() + 2)
		head()
	} else {
		d.Ln(3)
	}
	text := "Další soubory plánu najdete v online nabídce: "
	if url == "" {
		text = "Další soubory plánu: "
	}
	for i, f := range files {
		if i > 0 {
			text += ", "
		}
		text += f
	}
	d.paragraph("", text)
	if url != "" {
		d.font("", size, cAccent)
		d.SetX(margin)
		d.CellFormat(width, lh, url, "", 1, "L", false, 0, url)
	}
}

// planImage returns the image for fpdf and its type ("" = not an image fpdf
// draws). A JPEG rotated by its EXIF orientation (phone photos) is turned
// upright, as browsers show it.
func planImage(data []byte) ([]byte, string) {
	tp := map[string]string{"image/png": "PNG", "image/jpeg": "JPG", "image/gif": "GIF"}[http.DetectContentType(data)]
	if tp != "JPG" {
		return data, tp
	}
	o := jpegOrientation(data)
	if o != 3 && o != 6 && o != 8 {
		return data, tp
	}
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return data, tp
	}
	out := rotate(img, o)
	var b bytes.Buffer
	if err := jpeg.Encode(&b, out, &jpeg.Options{Quality: 85}); err != nil {
		return data, tp
	}
	return b.Bytes(), tp
}

// rotate turns img upright for EXIF orientation 3 (180°), 6 (90° clockwise)
// or 8 (90° counter-clockwise), sampling it down to maxPlanSide.
func rotate(img image.Image, o int) image.Image {
	b := img.Bounds()
	sw, sh := b.Dx(), b.Dy()
	step := max(1, (max(sw, sh)+maxPlanSide-1)/maxPlanSide)
	w, h := sw/step, sh/step
	if o != 3 {
		w, h = h, w
	}
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			var sx, sy int
			switch o {
			case 3:
				sx, sy = sw-1-x*step, sh-1-y*step
			case 6: // the top of the picture is on the right of the stored image
				sx, sy = y*step, sh-1-x*step
			case 8:
				sx, sy = sw-1-y*step, x*step
			}
			out.Set(x, y, img.At(b.Min.X+sx, b.Min.Y+sy))
		}
	}
	return out
}

// jpegOrientation reads the EXIF orientation tag of a JPEG (1 = upright or unknown).
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	for i := 2; i+4 <= len(data); {
		if data[i] != 0xFF {
			return 1
		}
		marker := data[i+1]
		if marker == 0xDA || marker == 0xD9 { // image data: no EXIF before it
			return 1
		}
		n := int(binary.BigEndian.Uint16(data[i+2:]))
		seg := data[i+4 : min(len(data), i+2+n)]
		if marker == 0xE1 && len(seg) > 14 && string(seg[:6]) == "Exif\x00\x00" {
			return tiffOrientation(seg[6:])
		}
		i += 2 + n
	}
	return 1
}

func tiffOrientation(t []byte) int {
	var bo binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return 1
	}
	off := int(bo.Uint32(t[4:]))
	if off+2 > len(t) {
		return 1
	}
	count := int(bo.Uint16(t[off:]))
	for k := range count {
		e := off + 2 + 12*k
		if e+12 > len(t) {
			return 1
		}
		if bo.Uint16(t[e:]) == 0x0112 {
			return int(bo.Uint16(t[e+8:]))
		}
	}
	return 1
}
