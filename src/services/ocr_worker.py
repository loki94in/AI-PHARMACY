import sys
import json
import os
import logging

# Suppress Paddle warnings/logs
logging.getLogger("ppocr").setLevel(logging.ERROR)

# Disable oneDNN/PIR to avoid PaddlePaddle 3.x runtime error on Windows CPU
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_enable_pir_in_executor"] = "0"

try:
    from paddleocr import PaddleOCR
    
    # Initialize PaddleOCR (uses lightweight mobile PP-OCRv4 by default)
    # use_gpu=False to run strictly on CPU
    ocr = PaddleOCR(lang='en', show_log=False, use_angle_cls=False)
    
    if len(sys.argv) < 2:
        print("___OCR_RESULT___")
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    img_path = sys.argv[1]
    if not os.path.exists(img_path):
        print("___OCR_RESULT___")
        print(json.dumps({"error": f"Image path does not exist: {img_path}"}))
        sys.exit(1)
        
    # Perform OCR
    result = ocr.ocr(img_path)
    
    # PaddleOCR outputs list of lists: [[ [ [x,y], [x,y], ...], (text, confidence) ]]
    words = []
    text_lines = []
    
    if result and result[0]:
        for line in result[0]:
            bbox = line[0] # [[x0,y0], [x1,y0], [x1,y1], [x0,y1]]
            text = line[1][0]
            confidence = float(line[1][1]) * 100
            
            text_lines.append(text)
            words.append({
                "text": text,
                "confidence": confidence,
                "bbox": {
                    "x0": int(bbox[0][0]),
                    "y0": int(bbox[0][1]),
                    "x1": int(bbox[2][0]),
                    "y1": int(bbox[2][1])
                }
            })
            
    print("___OCR_RESULT___")
    print(json.dumps({
        "success": True,
        "text": "\n".join(text_lines),
        "words": words
    }))
    
except Exception as e:
    print("___OCR_RESULT___")
    print(json.dumps({
        "success": False,
        "error": str(e)
    }))
