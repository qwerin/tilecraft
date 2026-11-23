package invoicepdf

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// withOrientation inserts an EXIF APP1 segment with the orientation tag after the SOI marker.
func withOrientation(jpg []byte, o uint16) []byte {
	tiff := []byte("MM\x00\x2a\x00\x00\x00\x08") // big endian, IFD0 at 8
	ifd := make([]byte, 2+12+4)
	binary.BigEndian.PutUint16(ifd, 1)
	binary.BigEndian.PutUint16(ifd[2:], 0x0112)
	binary.BigEndian.PutUint16(ifd[4:], 3) // SHORT
	binary.BigEndian.PutUint32(ifd[6:], 1)
	binary.BigEndian.PutUint16(ifd[10:], o)
	seg := append([]byte("Exif\x00\x00"), append(tiff, ifd...)...)
	app1 := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(app1[2:], uint16(len(seg)+2))
	out := append([]byte{}, jpg[:2]...)
	out = append(out, app1...)
	out = append(out, seg...)
	return append(out, jpg[2:]...)
}

// A phone photo stored sideways (EXIF orientation 6) is turned upright: 60×20 → 20×60, the red top-left corner ends top right.
func TestPlanImageOrientation(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 60, 20))
	for y := range 20 {
		for x := range 60 {
			img.Set(x, y, color.White)
		}
	}
	for y := range 5 {
		for x := range 5 {
			img.Set(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	if o := jpegOrientation(b.Bytes()); o != 1 {
		t.Fatalf("no EXIF: %d", o)
	}
	rotated := withOrientation(b.Bytes(), 6)
	if o := jpegOrientation(rotated); o != 6 {
		t.Fatalf("orientation %d", o)
	}
	data, tp := planImage(rotated)
	if tp != "JPG" {
		t.Fatal(tp)
	}
	out, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if s := out.Bounds().Size(); s.X != 20 || s.Y != 60 {
		t.Fatalf("size %v", s)
	}
	if r, g, _, _ := out.At(18, 1).RGBA(); r < 0xc000 || g > 0x6000 {
		t.Fatalf("top right is not red: %x %x", r, g)
	}
	if _, tp := planImage([]byte("%PDF-1.4")); tp != "" {
		t.Fatal("PDF as image")
	}
}

// Plans: an image on its own page, a PDF named with the link.
func TestQuotePlans(t *testing.T) {
	uncompressed(t)
	q := sampleQuote()
	q.Plans = []Plan{{Name: "plan-koupelna.png", Data: logoPNG(t)}, {Name: "plan.pdf", Data: []byte("%PDF-1.4")}}
	b := checkPDF(t)(QuotePDF(q))
	contains(t, "quote", b, "Kladečský plán", "plan-koupelna.png", "plan.pdf", "online nabídce")
	if !bytes.Contains(b, []byte("/Subtype /Image")) {
		t.Fatal("plan image missing")
	}
}
