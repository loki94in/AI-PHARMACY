import sys
import os
import json
import logging
from fastapi import FastAPI, Form
from fastapi.responses import JSONResponse
import uvicorn

# Suppress Paddle warnings/logs
logging.getLogger("ppocr").setLevel(logging.ERROR)

# Disable oneDNN/PIR to avoid PaddlePaddle 3.x runtime error on Windows CPU
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_enable_pir_in_executor"] = "0"

try:
    from paddleocr import PaddleOCR
    # Initialize PaddleOCR once on startup
    print("[OCR Server] Loading AI Models into memory...")
    # Using default en dictionary, use_angle_cls=False for speed, and limit side length to 720 to reduce RAM and CPU overhead
    ocr = PaddleOCR(lang='en', show_log=False, use_angle_cls=False, det_limit_side_len=720)
    print("[OCR Server] Models loaded. Server ready.")
except Exception as e:
    print(f"[OCR Server] Failed to initialize PaddleOCR: {e}")
    sys.exit(1)

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    print("___UVICORN_STARTED___", flush=True)

@app.get("/ping")
async def ping():
    return {"status": "ok"}

@app.post("/ocr")
async def process_ocr(image_path: str = Form(...)):
    if not os.path.exists(image_path):
        return JSONResponse(status_code=400, content={"success": False, "error": f"Image path does not exist: {image_path}"})
        
    try:
        # Perform OCR
        result = ocr.ocr(image_path)
        
        words = []
        text_lines = []
        
        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
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
                
        return JSONResponse(content={
            "success": True,
            "text": "\n".join(text_lines),
            "words": words
        })
        
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "error": str(e)
        })

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")
