import onnxruntime as ort
import numpy as np
import cv2
import os

def check_model():
    det_path = "models/buffalo_l/det_10g.onnx"
    # Try to find the path from HF cache if it's there, but easier to just check if it exists in a known location or download it.
    # Since I don't want to download again, I'll just look for it in the current directory if it was downloaded.
    # Actually, main.py downloads it.
    
    # Let's just inspect the session if we can find the file.
    # I'll use the path from the logs or common locations.
    # For now, let's just write a script that I can run if I find the path.
    pass

if __name__ == "__main__":
    # Just list files to see where the models are
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith(".onnx"):
                print(os.path.join(root, file))
