import numpy as np
import cv2
import onnxruntime as ort
import logging

logger = logging.getLogger("FBA-Backend.Recognizer")

class FaceRecognizer:
    def __init__(self, model_path: str):
        # Optimize ONNX Runtime session
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # Check for available providers
        available_providers = ort.get_available_providers()
        providers = ['CPUExecutionProvider']
        if 'CUDAExecutionProvider' in available_providers:
            providers.insert(0, 'CUDAExecutionProvider')
            
        self.session = ort.InferenceSession(model_path, sess_options, providers=providers)
        
        self.input_name = self.session.get_inputs()[0].name
        self.input_size = (112, 112)
        logger.info(f"Recognizer initialized with providers: {providers}")

    def align_face(self, img, kps):
        # Standard template for 112x112 alignment (InsightFace style)
        dst = np.array([
            [38.2946, 51.6963],
            [73.5318, 51.5014],
            [56.0252, 71.7366],
            [41.5493, 92.3655],
            [70.7299, 92.2041]
        ], dtype=np.float32)
        
        src = np.array(kps, dtype=np.float32)
        # Use estimateAffinePartial2D for similarity transform (scale, rotate, translate)
        tform, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
        if tform is None:
            return None
            
        warped = cv2.warpAffine(img, tform, (112, 112), borderValue=0.0)
        return warped

    def get_embedding(self, img, bbox, kps=None):
        if img is None or bbox is None:
            return None
            
        face_img = None
        if kps is not None:
            face_img = self.align_face(img, kps)
            
        if face_img is None:
            # Fallback to bbox crop if alignment fails or kps not provided
            x1, y1, x2, y2 = bbox
            # Add slight margin (10%)
            w, h = x2 - x1, y2 - y1
            margin_x, margin_y = w * 0.1, h * 0.1
            x1 = max(0, x1 - margin_x)
            y1 = max(0, y1 - margin_y)
            x2 = min(img.shape[1], x2 + margin_x)
            y2 = min(img.shape[0], y2 + margin_y)
            
            face_img = img[int(y1):int(y2), int(x1):int(x2)]
            if face_img.size == 0:
                return None
            face_img = cv2.resize(face_img, (112, 112))
        
        # 2. Test Time Augmentation (TTA): Original + Flipped
        def infer(image):
            blob = cv2.dnn.blobFromImage(image, 1.0/127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
            net_out = self.session.run(None, {self.input_name: blob})[0]
            return net_out.flatten()
            
        # Original
        emb1 = infer(face_img)
        # Flipped
        face_flipped = cv2.flip(face_img, 1)
        emb2 = infer(face_flipped)
        
        # Combine and Normalize
        embedding = emb1 + emb2
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding /= norm
            
        return embedding.tolist()

    def compute_similarity(self, feat1, feat2):
        a = np.array(feat1)
        b = np.array(feat2)
        # Both are normalized, so dot product is cosine similarity
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-6)
