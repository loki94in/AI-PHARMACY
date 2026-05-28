"""
Test PaddleOCR on all sample images in 'image sample' folder.
Prints extracted text, word count, confidence, and timing for each image.
"""
import sys
import json
import os
import time
import logging

# Suppress Paddle warnings/logs
logging.getLogger("ppocr").setLevel(logging.ERROR)
os.environ["FLAGS_log_dir"] = ""

from paddleocr import PaddleOCR

def main():
    sample_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image sample")
    if not os.path.isdir(sample_dir):
        print(f"ERROR: Sample directory not found: {sample_dir}")
        sys.exit(1)

    images = sorted([f for f in os.listdir(sample_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    if not images:
        print("No images found in sample directory.")
        sys.exit(1)

    print(f"Found {len(images)} sample images.\n")
    print("Initializing PaddleOCR (first load takes longer)...")
    init_start = time.time()
    # Set engine to 'onnxruntime' to run fully offline without paddlepaddle dependency
    ocr = PaddleOCR(use_textline_orientation=True, lang='en', engine='onnxruntime')
    init_time = time.time() - init_start
    print(f"PaddleOCR initialized in {init_time:.2f}s\n")

    results = []

    for i, img_name in enumerate(images, 1):
        img_path = os.path.join(sample_dir, img_name)
        print(f"{'='*70}")
        print(f"IMAGE {i}/{len(images)}: {img_name}")
        print(f"{'='*70}")

        start = time.time()
        result = ocr.ocr(img_path, cls=True)
        elapsed = time.time() - start

        words = []
        text_lines = []
        confidences = []

        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
                text = line[1][0]
                conf = float(line[1][1]) * 100
                text_lines.append(text)
                confidences.append(conf)
                words.append({
                    "text": text,
                    "confidence": round(conf, 1),
                    "bbox": {
                        "x0": int(bbox[0][0]),
                        "y0": int(bbox[0][1]),
                        "x1": int(bbox[2][0]),
                        "y1": int(bbox[2][1])
                    }
                })

        full_text = "\n".join(text_lines)
        avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0

        print(f"\n  Time: {elapsed:.2f}s")
        print(f"  Words detected: {len(words)}")
        print(f"  Avg confidence: {avg_conf}%")
        print(f"\n  --- EXTRACTED TEXT ---")
        if full_text:
            for line in text_lines:
                print(f"    {line}")
        else:
            print(f"    (no text detected)")

        print(f"\n  --- WORD DETAILS ---")
        for w in words:
            print(f"    [{w['confidence']:5.1f}%] {w['text']}")

        print()

        results.append({
            "image": img_name,
            "time_sec": round(elapsed, 2),
            "word_count": len(words),
            "avg_confidence": avg_conf,
            "text": full_text,
            "words": words
        })

    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    total_time = sum(r["time_sec"] for r in results)
    print(f"  Total images processed: {len(results)}")
    print(f"  Total processing time:  {total_time:.2f}s (avg {total_time/len(results):.2f}s/image)")
    print(f"  PaddleOCR init time:    {init_time:.2f}s")
    print()
    for r in results:
        status = "OK" if r["word_count"] > 0 else "NO TEXT"
        print(f"  [{status:>7}] {r['image'][:50]:50s} | {r['word_count']:3d} words | {r['avg_confidence']:5.1f}% | {r['time_sec']:.2f}s")

    # Save JSON results
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "paddle_ocr_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"init_time_sec": round(init_time, 2), "results": results}, f, indent=2, ensure_ascii=False)
    print(f"\n  JSON results saved to: {out_path}")

if __name__ == "__main__":
    main()
