import numpy as np
import cv2
import onnxruntime as ort
import logging

logger = logging.getLogger("FBA-Backend.Recognizer")

class FaceRecognizer:
    def __init__(self, model_path: str):
        # Optimize ONNX Runtime session for low memory
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        
        # Check for available providers
        available_providers = ort.get_available_providers()
        providers = ['CPUExecutionProvider']
        if 'CUDAExecutionProvider' in available_providers:
            providers.insert(0, 'CUDAExecutionProvider')
            
        self.session = ort.InferenceSession(model_path, sess_options, providers=providers)
        
        input_meta = self.session.get_inputs()[0]
        self.input_name = input_meta.name
        self.input_shape = input_meta.shape
        self.input_size = (112, 112)
        logger.info(f"Recognizer initialized. Input name: {self.input_name}, Input shape: {self.input_shape}")
        logger.info(f"Providers: {providers}")

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

    def get_embeddings(self, img, bboxes, kpss=None):
        """
        Batch processing for multiple faces
        """
        if img is None or not bboxes:
            return []
            
        face_imgs = []
        valid_indices = []
        
        for i, bbox in enumerate(bboxes):
            kps = kpss[i] if kpss and i < len(kpss) else None
            
            face_img = None
            if kps is not None:
                face_img = self.align_face(img, kps)
                
            if face_img is None:
                # Fallback to bbox crop
                x1, y1, x2, y2 = bbox
                w, h = x2 - x1, y2 - y1
                margin_x, margin_y = w * 0.1, h * 0.1
                x1 = max(0, x1 - margin_x)
                y1 = max(0, y1 - margin_y)
                x2 = min(img.shape[1], x2 + margin_x)
                y2 = min(img.shape[0], y2 + margin_y)
                
                face_img = img[int(y1):int(y2), int(x1):int(x2)]
                if face_img.size == 0:
                    continue
                face_img = cv2.resize(face_img, (112, 112))
            
            face_imgs.append(face_img)
            valid_indices.append(i)
            
        if not face_imgs:
            return []
            
        # Batch inference
        # Prepare batch blob
        if not face_imgs:
            return []
            
        # Prepare all images for TTA (Original + Flipped)
        all_images = []
        for face_img in face_imgs:
            all_images.append(face_img)
            all_images.append(cv2.flip(face_img, 1))

        # Run inference for all faces
        embeddings = []
        
        # Check if model supports batching (first dimension is dynamic or > 1)
        # Force supports_batching to False if model specifically expects batch size 1
        batch_dim = self.input_shape[0]
        supports_batching = (not isinstance(batch_dim, int)) or (batch_dim > 1) or (batch_dim == -1)
        
        # Override: If we saw warnings about shape mismatch, it's safer to run sequential
        # Most InsightFace models work best with batch size 1 in ONNX
        if batch_dim == 1 or batch_dim == '1':
            supports_batching = False
            
        if supports_batching:
            try:
                # Batch inference
                blob = cv2.dnn.blobFromImages(all_images, 1.0/127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
                net_out = self.session.run(None, {self.input_name: blob})[0]
                logger.debug(f"Batch inference output shape: {net_out.shape}")
            except Exception as e:
                logger.warning(f"Batch inference failed, falling back to sequential: {e}")
                supports_batching = False

        if not supports_batching:
            # Sequential inference
            logger.info("Running sequential inference for faces (TTA enabled)")
            net_out_list = []
            for face_img in all_images:
                # blobFromImage returns (1, 3, 112, 112)
                blob = cv2.dnn.blobFromImage(face_img, 1.0/127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
                out = self.session.run(None, {self.input_name: blob})[0]
                net_out_list.append(out.flatten())
            net_out = np.array(net_out_list)
            logger.debug(f"Sequential inference combined output shape: {net_out.shape}")

        for i in range(len(face_imgs)):
            # Combine Original (i*2) and Flipped (i*2 + 1)
            # Use TTA: Average the embeddings of original and flipped images
            emb_orig = net_out[i*2].flatten()
            emb_flip = net_out[i*2+1].flatten()
            
            embedding = emb_orig + emb_flip
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding /= norm
            embeddings.append(embedding.tolist())
            
        return embeddings

    def get_embedding(self, img, bbox, kps=None):
        # Wrapper for single face backward compatibility
        res = self.get_embeddings(img, [bbox], [kps] if kps else None)
        return res[0] if res else None

    def compute_similarity(self, feat1, feat2):
        a = np.array(feat1).flatten()
        b = np.array(feat2).flatten()
        # Both are normalized, so dot product is cosine similarity
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-6))
