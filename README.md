# Face-Based Attendance (FBA) System

A robust, high-performance face detection and recognition system built with FastAPI, ONNX Runtime, and Supabase. This system is designed for educational environments to automate attendance tracking.

## 🚀 Key Features

- **FastAPI Backend**: Asynchronous API for session management and real-time recognition.
- **Optimized Face Detection**: Uses SCRFD (Sample and Computation Redistribution for Face Detection) with vectorized post-processing and NMS.
- **High-Accuracy Recognition**: Uses ArcFace with keypoint-based alignment (Similarity Transform) and Test Time Augmentation (TTA).
- **GPU Acceleration**: Built-in support for CUDA via ONNX Runtime for high-throughput processing.
- **Supabase Integration**: Seamless integration with Supabase Auth, Storage (for student photos), and Database (for student metadata and attendance records).
- **Batch Processing**: Utility scripts for generating and updating face embeddings for all registered students.

## 🛠️ Technology Stack

- **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
- **Deep Learning Runtime**: [ONNX Runtime](https://onnxruntime.ai/)
- **Computer Vision**: [OpenCV](https://opencv.org/)
- **Database & Storage**: [Supabase](https://supabase.com/)
- **Model Source**: [InsightFace](https://github.com/deepinsight/insightface)

## 📁 Project Structure

```text
FBA/
├── backend/
│   ├── services/
│   │   ├── face_detector.py      # SCRFD detection logic
│   │   ├── face_recognizer.py    # ArcFace recognition & alignment
│   │   └── embeddings_updation.py # Session embedding management
│   ├── main.py                   # FastAPI application & routes
│   ├── update_all_embeddings.py  # Batch embedding generation script
│   ├── .env                      # Environment variables (ignored by git)
│   ├── requirements.txt          # Python dependencies
│   └── venv/                     # Virtual environment
└── README.md
```

## ⚙️ Setup Instructions

### 1. Prerequisites
- Python 3.9+
- CUDA Toolkit (optional, for GPU acceleration)

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
```

### 3. Installation
Navigate to the `backend` directory and install dependencies:
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate # Linux/Mac
pip install -r requirements.txt
```

### 4. Database Setup
The system expects the following Supabase structure:
- **Table: `students`**: `id`, `name`, `roll_no`, `branch`, `year`, `division`, `face_descriptor` (JSONB)
- **Table: `sessions`**: `id`, `branch`, `year`, `division`, `subject`, `status`
- **Table: `attendance_records`**: `id`, `session_id`, `student_id`, `timestamp`
- **Storage Bucket: `student_faces`**: Organized as `[Branch]/[Year]/[Division]/[RollNo].jpg`

## 🏃 Running the System

### Batch Update Embeddings
To generate embeddings for all students in the database:
```bash
.\venv\Scripts\python update_all_embeddings.py
```

### Start the Backend Server
```bash
.\venv\Scripts\python main.py
```
The API will be available at `http://localhost:8000`. You can access the interactive documentation at `http://localhost:8000/docs`.

## 🛡️ Git Management
This project includes pre-configured `.gitignore` files to exclude:
- Python virtual environments (`venv/`)
- IDE settings (`.vscode/`, `.idea/`)
- Environment variables (`.env`)
- Temporary files and cache (`__pycache__/`, `*.log`, `*.onnx`)
