# 🎓 Face-Based Attendance (FBA) System

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
  <img src="https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
</p>

<p align="center">
  <b>Seamless attendance tracking powered by AI facial recognition technology.</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

---

## 🌟 Key Features

| Feature | Description |
|---------|-------------|
| 🎯 **AI-Powered Recognition** | State-of-the-art facial recognition using InsightFace models (buffalo_l) |
| ⚡ **Instant Check-in** | Mark attendance within seconds - no cards, codes, or manual entry |
| 🔒 **Secure & Private** | Encrypted biometric data storage with Supabase RLS policies |
| 📱 **Mobile-Friendly** | Responsive design works on phones, tablets, and desktops |
| 📊 **Real-time Analytics** | Live attendance tracking with exportable reports (CSV/PDF) |
| 🏫 **Multi-Class Support** | Manage multiple branches, years, divisions, and subjects |
| 📷 **Batch Recognition** | Detect and recognize up to 25 faces simultaneously |
| 📍 **Precise Geofencing** | High-precision (6 decimal places) location enforcement for attendance |
| 🤳 **Student Self-Capture** | Secure mode for students to mark their own attendance within class bounds |
| 📱 **One Device Policy** | IP-based restrictions to prevent proxy attendance on same device |
| 🌐 **Cloud-Ready** | Deploy on Railway (backend) and Vercel (frontend) |

---

## 🔧 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    FBA SYSTEM ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │◄──►│   Backend    │◄──►│   Supabase   │      │
│  │   (React)    │    │  (FastAPI)   │    │  (Postgres)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                                      │
│         │                   ▼                                      │
│         │            ┌──────────────┐                            │
│         │            │  Face Recog  │                            │
│         │            │   (ONNX)     │                            │
│         │            └──────────────┘                            │
│         │                                                        │
│  ┌──────┴──────┐                                               │
│  │   Webcam    │──► Face Detection ──► Feature Extraction     │
│  │  /Camera    │        (YOLO)           (Embedding)           │
│  └─────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Recognition Flow

1. **Session Creation**: Teacher creates an attendance session for a specific class.
2. **Location Capture**: Teacher's precise GPS location (6 decimal places) is stored as the geofence center.
3. **Mode Selection**:
   - **Teacher-Led**: Teacher captures students using their device (for quick batch marking).
   - **Student Self-Capture**: Students mark their own attendance via a secure link (requires valid location).
4. **Student Enrollment**: Students are pre-enrolled with face descriptors stored in database.
5. **Live Recognition**: Camera captures faces and sends images to backend.
6. **Face Detection**: YOLO-based detector identifies face regions.
7. **Feature Extraction**: Deep learning model generates face embeddings (512-d vectors).
8. **Similarity Matching**: Cosine similarity compares embeddings against enrolled students.
9. **Validation**: Checks for:
   - Face match confidence (> 0.45)
   - Geolocation (must be within ~15m of teacher)
   - Device Uniqueness (prevents proxy)
10. **Attendance Marking**: Matches are recorded in Supabase.
11. **Real-time Updates**: Frontend displays marked attendance instantly.

---

## 📁 Project Structure

```
FBA/
├── 📂 backend/                    # FastAPI Python Backend
│   ├── 📄 main.py                 # Main application & API routes
│   ├── 📄 requirements.txt        # Python dependencies
│   ├── 📄 add_missing_students.py # Student enrollment script
│   ├── 📄 sync_students_v2.py     # Student synchronization
│   ├── 📄 rebuild_students.py     # Database rebuild utility
│   └── 📂 services/
│       ├── 📄 face_detector.py   # YOLO face detection
│       ├── 📄 face_recognizer.py # Embedding extraction & matching
│       └── 📄 embeddings_updation.py # Cache management
│
├── 📂 frontend/                   # React TypeScript Frontend
│   ├── 📄 package.json            # Node.js dependencies
│   ├── 📄 vite.config.ts          # Vite configuration
│   ├── 📄 tailwind.config.ts      # Tailwind CSS config
│   ├── 📂 src/
│   │   ├── 📂 pages/              # Page components
│   │   │   ├── 📄 Index.tsx       # Landing page
│   │   │   ├── 📄 Login.tsx       # Authentication
│   │   │   ├── 📄 Signup.tsx      # User registration
│   │   │   ├── 📄 TeacherDashboard.tsx  # Teacher home
│   │   │   ├── 📄 NewAttendance.tsx     # Create session
│   │   │   ├── 📄 AttendanceSession.tsx # Camera interface
│   │   │   ├── 📄 CameraRecognition.tsx # Face detection UI
│   │   │   ├── 📄 SessionDetails.tsx    # View attendance
│   │   │   ├── 📄 TeacherPastSessions.tsx # Session history
│   │   │   └── 📄 StudentListView.tsx   # Student management
│   │   └── 📂 components/         # Reusable UI components
│   └── 📂 public/                 # Static assets
│
├── 📂 student_faces/              # Student photo storage
├── 📄 supabase_schema.sql         # Database schema
├── 📄 start-fba.bat              # Windows startup script
├── 📄 run-backend.bat            # Backend startup
├── 📄 run-frontend.bat           # Frontend startup
└── 📄 README.md                   # This file
```

---

## ✅ Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Node.js**: v18+ (for frontend)
- **Python**: v3.9+ (for backend)
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Storage**: 2GB free space for models and dependencies
- **Camera**: Webcam or IP camera (for attendance marking)

### Accounts Needed

1. **Supabase Account**: [https://supabase.com](https://supabase.com) (Free tier available)
2. **Hugging Face Account**: [https://huggingface.co](https://huggingface.co) (For model downloads)
3. **Railway Account** (Optional): [https://railway.app](https://railway.app) (Backend hosting)
4. **Vercel Account** (Optional): [https://vercel.com](https://vercel.com) (Frontend hosting)

---

## 🚀 Quick Start Guide

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/fba-attendance.git
cd fba-attendance
```

### Step 2: Supabase Setup

1. **Create a new project** on [Supabase](https://supabase.com)
2. **Get your credentials** from Project Settings → API:
   - `SUPABASE_URL` (e.g., `https://xxxxxxxx.supabase.co`)
   - `SUPABASE_ANON_KEY` (public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (secret key)

3. **Initialize the database** by running the SQL schema:

```sql
-- Open SQL Editor in Supabase Dashboard
-- Copy contents from supabase_schema.sql and execute
```

### Step 3: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
copy .env.example .env
```

**Configure your `.env` file:**

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_KEY=your-service-role-key-here

# Hugging Face Model Repository
HF_REPO=public-data/insightface
DET_MODEL_FILE=models/buffalo_l/det_10g.onnx
REC_MODEL_FILE=models/buffalo_l/w600k_r50.onnx

# Recognition Settings
RECOGNITION_THRESHOLD=0.45

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com

# Server Settings
PORT=8000
```

```bash
# Start the backend server
python main.py
```

The API will be available at: `http://localhost:8000`

### Step 4: Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create environment file
copy .env.example .env
```

**Configure your `.env` file:**

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Backend API URL
VITE_API_URL=http://localhost:8000
```

```bash
# Start the development server
npm run dev
```

The application will open at: `http://localhost:5173`

### Step 5: Add Students

1. **Place student photos** in the `student_faces/` directory with filename format: `{roll_number}.jpg`
   - Example: `01.jpg`, `02.jpg`, `15.jpg`, etc.

2. **Update student data** using the provided Excel file:
   - Edit `TE Computer A 25-26.xlsx` with student details (Name, Roll Number, Branch, Year, Division)

3. **Sync students to database**:

```bash
cd backend
python add_missing_students.py
```

### Database Setup (Supabase)

Before deploying the backend, ensure your Supabase database is set up correctly.

1.  **Run Initial Schema**: Execute `supabase_schema.sql` in the Supabase SQL Editor.
2.  **Run Migrations**: Execute the following files in order:
    - `migrations/01_add_ip_to_attendance.sql` (Enables IP-based one-device enforcement)
    - `migrations/02_add_location_to_sessions.sql` (Adds teacher location storage)
    - `migrations/03_enforce_location_precision.sql` (Enforces 6-decimal precision for coordinates)

---
## 🌐 Production Deployment

### Backend Deployment (Railway)

Railway provides an excellent platform for hosting Python applications with automatic scaling.

#### Step 1: Prepare for Deployment

```bash
git add .
git commit -m "Prepare for production deployment"
git push origin main
```

#### Step 2: Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your FBA repository
4. Configure the service:
   - **Root Directory**: `backend`
   - **Service Type**: Python
   - **Start Command**: `python main.py`

#### Step 3: Environment Variables

Add these variables in Railway Dashboard → Your Service → Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase service role key | `eyJ...` |
| `HF_REPO` | HuggingFace model repository | `public-data/insightface` |
| `DET_MODEL_FILE` | Face detection model | `models/buffalo_l/det_10g.onnx` |
| `REC_MODEL_FILE` | Face recognition model | `models/buffalo_l/w600k_r50.onnx` |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins | `https://your-app.vercel.app` |
| `RECOGNITION_THRESHOLD` | Similarity threshold (0.0-1.0) | `0.45` |

#### Step 4: Verify Deployment

Once deployed, visit your Railway URL:
```
https://your-project.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "init_status": "ready",
  "timestamp": "2026-02-03T10:30:00.000000"
}
```

---

### Frontend Deployment (Vercel)

Vercel offers the fastest way to deploy React applications with automatic HTTPS.

#### Step 1: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"** → **"Import Git Repository"**
3. Select your FBA repository
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

#### Step 2: Environment Variables

Add these variables in Vercel Dashboard → Your Project → Settings → Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `VITE_API_URL` | Railway backend URL | `https://your-backend.up.railway.app` |

#### Step 3: Deploy

Click **"Deploy"** and wait for the build to complete. Your app will be live at:
```
https://your-project.vercel.app
```

---

### Redeployment Instructions

If automatic deployment is not working:

**Railway Manual Redeploy:**
1. Go to Railway Dashboard → Your Service
2. Click **"Deployments"** tab
3. Find the latest commit
4. Click **"Redeploy"** button

**Vercel Manual Redeploy:**
1. Go to Vercel Dashboard → Your Project
2. Click **"Deployments"** tab
3. Find the latest commit
4. Click **⋮** (three dots) → **"Redeploy"**

**Force Redeploy via Git:**
```bash
git commit --allow-empty -m "Trigger redeployment"
git push origin main
```

---

## 📱 Mobile Access

After production deployment, access the system on mobile devices:

### Prerequisites
- **HTTPS Connection**: Must use HTTPS (automatic on Vercel)
- **Camera Permissions**: Browser will request camera access
- **Modern Browser**: Chrome, Safari, Firefox (latest versions)

### Mobile Setup

1. **Clear Browser Cache** on your mobile device
2. **Navigate to Production URL** (e.g., `https://your-app.vercel.app`)
3. **Allow Camera Access** when prompted
4. **Test Recognition**: Position face within camera frame

### Best Practices for Mobile
- ✅ Use good lighting (avoid backlighting)
- ✅ Hold device at arm's length
- ✅ Ensure face is clearly visible
- ✅ Use rear camera for better quality (if available)

---

## 🎓 Usage Guide

### For Teachers

#### 1. Creating an Attendance Session

1. **Login** with your teacher credentials at `/login`
2. Navigate to **"New Attendance"** from the dashboard
3. Fill in session details:
   - **Branch**: COMPUTER, IT, etc.
   - **Year**: FE, SE, TE, BE
   - **Division**: A, B, C
   - **Subject**: Select from dropdown or enter custom
   - **Classroom**: Room number (101-1110)
4. **Select Capture Mode**:
   - **Teacher Mode**: You scan students using your device.
   - **Student Mode**: Generate a QR code for students to scan and mark their own attendance.
5. **Start Session**: The session begins, and your location is locked as the class center.

#### 2. Student Self-Capture (New)

If you select "Student Mode":
1. A QR code is displayed on your screen.
2. Students scan the QR code with their phones.
3. They are redirected to a secure capture page.
4. Their location is validated against your (teacher's) location (within ~15m).
5. They capture their face to mark attendance.

#### 3. Monitoring Attendance

1. Go to **"Session Details"** page.
2. View real-time attendance updates
3. See total count of students marked present
4. Check individual student details

#### 3. Ending a Session

1. Click **"End Session"** button when class is complete
2. Session will be archived automatically
3. Export attendance report if needed

#### 4. Exporting Reports

1. Navigate to **"Past Sessions"**
2. Select a completed session
3. Click **"Export"** button
4. Choose format:
   - **CSV**: For Excel/spreadsheet analysis
   - **PDF**: For official records

---

### For Students

#### 1. Accessing the Session

1. **Scan QR Code**: Use your phone camera to scan the QR code displayed by the teacher.
2. **Open Link**: Or use the direct link shared by the teacher.
3. **Allow Permissions**: Grant camera and location access when prompted.

#### 2. Marking Attendance

1. **Location Check**: The system verifies you are within range of the classroom.
2. **Face Capture**: Position your face within the frame.
3. **Auto-Mark**: The system detects your face, verifies your identity, and marks you present.
4. **One-Device Check**: You cannot mark attendance for others using the same device.

---

### Attendance Modes

| Mode | Description | Best For |
|------|-------------|----------|
| 🤳 **Student Self-Capture** | Students mark their own attendance via QR/Link | Large classes, quick entry |
| 👨‍🏫 **Teacher-Led Capture** | Teacher scans students one by one | Controlled environments, labs |
| 📍 **Geofenced Entry** | Requires being physically present in class | Preventing proxy attendance |

---

## 🔧 Environment Variables Reference

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | ✅ | - | Supabase project URL |
| `SUPABASE_KEY` | ✅ | - | Service role key (full access) |
| `SUPABASE_ANON_KEY` | ⚠️ | - | Public anon key (alternative) |
| `HF_REPO` | ❌ | `public-data/insightface` | HuggingFace model repo |
| `DET_MODEL_FILE` | ❌ | `models/buffalo_l/det_10g.onnx` | Detection model path |
| `REC_MODEL_FILE` | ❌ | `models/buffalo_l/w600k_r50.onnx` | Recognition model path |
| `RECOGNITION_THRESHOLD` | ❌ | `0.45` | Face match threshold (0.0-1.0) |
| `ALLOWED_ORIGINS` | ✅ | `*` | CORS allowed origins (comma-separated) |
| `PORT` | ❌ | `8000` | Server port |

### Frontend Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public anon key (safe to expose) |
| `VITE_API_URL` | ✅ | Backend API URL |

---

## 🐛 Troubleshooting

### Backend Issues

#### Problem: `ModuleNotFoundError: No module named 'xxx'`
**Solution:**
```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

#### Problem: Models not downloading from HuggingFace
**Solution:**
```bash
# Check your internet connection
# Try manually downloading models:
python -c "from huggingface_hub import hf_hub_download; hf_hub_download('public-data/insightface', 'models/buffalo_l/det_10g.onnx')"
```

#### Problem: `503 Service Unavailable` - "Embedding manager not initialized"
**Solution:**
1. Check `/health` endpoint to see init status
2. If status is "error", check server logs for details
3. Retry initialization: `POST /retry-init`
4. Ensure HuggingFace is accessible from your server

#### Problem: High memory usage / slow responses
**Solution:**
```env
# Reduce max faces to process
# Adjust in face_detector.py or via environment
MAX_FACES=10
```

---

### Frontend Issues

#### Problem: `Failed to connect to backend`
**Solution:**
1. Check if backend is running: `http://localhost:8000/health`
2. Verify `VITE_API_URL` in `.env` file
3. Check CORS settings in backend (ALLOWED_ORIGINS)
4. Ensure no firewall blocking port 8000

#### Problem: Camera not working / permissions denied
**Solution:**
1. Ensure HTTPS is used (required for camera on production)
2. Check browser permissions: `chrome://settings/content/camera`
3. Try different browser (Chrome recommended)
4. Clear browser cache and reload

#### Problem: `CORS policy: No 'Access-Control-Allow-Origin' header`
**Solution:**
```env
# Add your frontend URL to backend .env
ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
```

#### Problem: Build fails on Vercel
**Solution:**
```bash
# Local test
cd frontend
npm run build

# Check for TypeScript errors
npm run lint

# If issues persist, clear node_modules
rm -rf node_modules package-lock.json
npm install
```

---

### Database Issues

#### Problem: `Row Level Security violation`
**Solution:**
```sql
-- In Supabase SQL Editor, check RLS policies:
SELECT * FROM pg_policies WHERE tablename = 'students';

-- Ensure proper policies exist:
CREATE POLICY "Public read students" ON students FOR SELECT USING (true);
```

#### Problem: Students not appearing in dropdown
**Solution:**
1. Check if students table has data:
   ```sql
   SELECT COUNT(*) FROM students;
   ```
2. Run sync script again:
   ```bash
   cd backend
   python add_missing_students.py
   ```
3. Verify face descriptors are extracted (check `face_descriptor` column)

#### Problem: Duplicate key violation when marking attendance
**Solution:**
This is normal behavior - students can only be marked once per session. Check if student already marked attendance.

---

## 🔒 Security Considerations

### Data Protection

- ✅ **Face descriptors** (not raw images) are stored in database
- ✅ **Encrypted storage** via Supabase at-rest encryption
- ✅ **Row Level Security (RLS)** policies prevent unauthorized access
- ✅ **HTTPS enforced** in production (Vercel/Railway default)
- ✅ **No face images** transmitted after enrollment

### Best Practices

1. **Use strong passwords** for Supabase and cloud accounts
2. **Rotate API keys** regularly
3. **Enable 2FA** on all accounts (Supabase, Railway, Vercel)
4. **Review RLS policies** before production deployment
5. **Monitor access logs** in Supabase Dashboard
6. **Limit CORS origins** to specific domains only

### Privacy Compliance

- Students provide **consent** before face enrollment
- Raw face images are **not stored** in production
- Only **mathematical embeddings** (512-d vectors) are retained
- Data can be **deleted permanently** via Supabase dashboard

---

## ⚡ Performance Tips

### Backend Optimization

1. **Model Caching**: Models are cached in memory after first load
2. **Embedding Cache**: Student embeddings are cached per session
3. **Batch Processing**: Process up to 25 faces simultaneously
4. **Asynchronous I/O**: Non-blocking database operations

### Recommended Settings

```env
RECOGNITION_THRESHOLD=0.45  # Balance accuracy vs speed
MAX_FACES=25                # Adjust based on your use case
```

### Frontend Optimization

1. **Image Compression**: Images are resized before sending to backend
2. **Debounced Requests**: Prevents spamming the recognition API
3. **Optimistic UI**: Shows attendance status before server confirmation
4. **Lazy Loading**: Components load on-demand

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test` (frontend) / `pytest` (backend)
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- **Python**: Follow PEP 8 guidelines
- **TypeScript**: Use ESLint configuration
- **Commits**: Use conventional commit messages

### Reporting Issues

When reporting bugs, please include:
- Operating system and version
- Browser (if frontend issue)
- Python/Node versions
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 FBA Project

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

This project uses the following open-source technologies:

- **[FastAPI](https://fastapi.tiangolo.com/)** - Modern, fast web framework
- **[React](https://react.dev/)** - UI library for building interfaces
- **[Supabase](https://supabase.com/)** - Open source Firebase alternative
- **[InsightFace](https://github.com/deepinsight/insightface)** - Face analysis library
- **[ONNX Runtime](https://onnxruntime.ai/)** - Cross-platform ML acceleration
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com/)** - Re-usable components
- **[Lucide Icons](https://lucide.dev/)** - Beautiful icons

Special thanks to:
- The HuggingFace team for hosting face recognition models
- The open-source community for continuous support
- All contributors who have helped improve this project

---

## 💬 Support

Need help? We are here for you!

### Documentation
- 📖 [Full Documentation](https://docs.yourproject.com) (Coming soon)
- 🎥 [Video Tutorials](https://youtube.com/yourchannel) (Coming soon)

### Community
- 💬 [Discord Server](https://discord.gg/yourlink) - Join the community
- 🐦 [Twitter/X](https://twitter.com/yourhandle) - Follow for updates
- 📧 [Email Support](mailto:support@yourproject.com)

### Issue Reporting
- 🐛 [GitHub Issues](https://github.com/yourusername/fba-attendance/issues)
- 🆘 For security issues, email: security@yourproject.com

### Commercial Support
For enterprise deployment and customization:
- 📧 Email: enterprise@yourproject.com
- 🌐 Website: [https://yourproject.com](https://yourproject.com)

---

<p align="center">
  Made with ❤️ for education
  <br>
  <a href="https://github.com/yourusername/fba-attendance">⭐ Star us on GitHub</a>
</p>