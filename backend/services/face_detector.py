import numpy as np
import cv2
import onnxruntime as ort
import logging

logger = logging.getLogger("FBA-Backend.Detector")

class FaceDetector:
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
        
        self.input_name = self.session.get_inputs()[0].name
        self.target_size = (640, 640)
        self.strides = [8, 16, 32]
        self.anchor_centers = self._generate_anchor_centers()
        logger.info(f"Detector initialized with providers: {providers}")

    def _generate_anchor_centers(self):
        anchor_centers = []
        for stride in self.strides:
            h, w = self.target_size[0] // stride, self.target_size[1] // stride
            anchor_grid = np.stack(np.mgrid[:h, :w][::-1], axis=-1).reshape(-1, 2)
            # SCRFD usually has 2 anchors per location
            anchor_centers.append(np.repeat(anchor_grid * stride, 2, axis=0).astype(np.float32))
        return anchor_centers

    def detect(self, img, threshold=0.4, max_num=10):
        if img is None:
            return [], []
            
        h, w = img.shape[:2]
        
        # 1. Multi-scale Preprocessing (Resize while keeping aspect ratio)
        input_size = self.target_size[0]
        im_ratio = float(h) / w
        if im_ratio > 1:
            new_h = input_size
            new_w = int(new_h / im_ratio)
        else:
            new_w = input_size
            new_h = int(new_w * im_ratio)
        
        det_scale = float(new_h) / h
        resized_img = cv2.resize(img, (new_w, new_h))
        
        # Padding to 640x640
        det_img = np.zeros((input_size, input_size, 3), dtype=np.uint8)
        det_img[:new_h, :new_w, :] = resized_img
        
        # Normalize: (x - 127.5) / 128.0
        blob = cv2.dnn.blobFromImage(det_img, 1.0/128.0, (input_size, input_size), (127.5, 127.5, 127.5), swapRB=True)
        
        # 2. Inference
        outputs = self.session.run(None, {self.input_name: blob})
        
        scores_list = outputs[:3]  # First 3 are scores
        bboxes_list = outputs[3:6] # Next 3 are bboxes
        kpss_list = outputs[6:9]   # Next 3 are keypoints (if available)
        
        proposals = []
        scores_all = []
        kpss_all = []
        
        for idx, stride in enumerate(self.strides):
            scores = scores_list[idx][:, 0]
            bboxes = bboxes_list[idx] * stride
            anchors = self.anchor_centers[idx]
            
            # Filter by threshold
            pos_inds = np.where(scores >= threshold)[0]
            if len(pos_inds) == 0:
                continue
                
            pos_scores = scores[pos_inds]
            pos_bboxes = bboxes[pos_inds]
            pos_anchors = anchors[pos_inds]
            
            # Vectorized decoding for bboxes
            x1 = (pos_anchors[:, 0] - pos_bboxes[:, 0]) / det_scale
            y1 = (pos_anchors[:, 1] - pos_bboxes[:, 1]) / det_scale
            x2 = (pos_anchors[:, 0] + pos_bboxes[:, 2]) / det_scale
            y2 = (pos_anchors[:, 1] + pos_bboxes[:, 3]) / det_scale
            
            # Decode keypoints if available
            if idx < len(kpss_list):
                kpss = kpss_list[idx] * stride
                pos_kpss = kpss[pos_inds]
                pos_kpss_decoded = pos_kpss.copy()
                for i in range(5):
                    pos_kpss_decoded[:, i*2] = (pos_anchors[:, 0] + pos_kpss[:, i*2]) / det_scale
                    pos_kpss_decoded[:, i*2+1] = (pos_anchors[:, 1] + pos_kpss[:, i*2+1]) / det_scale
                
                kpss_all.append(pos_kpss_decoded)
            
            proposals.append(np.stack([x1, y1, x2, y2], axis=-1))
            scores_all.append(pos_scores)
        
        if not proposals:
            # Fallback for small faces: try lower threshold
            if threshold > 0.2:
                return self.detect(img, threshold=0.2, max_num=max_num)
            return [], []
            
        proposals = np.concatenate(proposals, axis=0)
        scores_all = np.concatenate(scores_all, axis=0)
        
        # 3. NMS
        nms_proposals = proposals.copy()
        nms_proposals[:, 2] = nms_proposals[:, 2] - nms_proposals[:, 0] # w
        nms_proposals[:, 3] = nms_proposals[:, 3] - nms_proposals[:, 1] # h
        
        indices = cv2.dnn.NMSBoxes(nms_proposals.tolist(), scores_all.tolist(), threshold, 0.4)
        
        if len(indices) == 0:
            return [], []
            
        # Handle different OpenCV versions returning different types of indices
        if isinstance(indices, np.ndarray):
            indices = indices.flatten()
        
        # Limit to max_num
        indices = indices[:max_num]
            
        final_boxes = proposals[indices].tolist()
        
        final_kpss = []
        if kpss_all:
            kpss_all = np.concatenate(kpss_all, axis=0)
            for idx in indices:
                final_kpss.append(kpss_all[idx].reshape(5, 2).tolist())
            
        logger.info(f"Detected {len(final_boxes)} faces.")
        return final_boxes, final_kpss

    def _nms(self, dets, thresh):
        x1, y1, x2, y2 = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3]
        scores = dets[:, 4]
        areas = (x2 - x1 + 1) * (y2 - y1 + 1)
        order = scores.argsort()[::-1]
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            w = np.maximum(0.0, xx2 - xx1 + 1)
            h = np.maximum(0.0, yy2 - yy1 + 1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(ovr <= thresh)[0]
            order = order[inds + 1]
        return keep
