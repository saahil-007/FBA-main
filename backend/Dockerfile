# Use Python 3.11 slim image for a smaller footprint
FROM python:3.11-slim

# Install system dependencies for OpenCV and general production stability
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libxcb1 \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create a non-privileged user for security
RUN useradd -m appuser
WORKDIR /home/appuser/app

# Set up the virtual environment in production
# This ensures isolation even within the container
ENV VIRTUAL_ENV=/home/appuser/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create log directory and ensure permissions
RUN mkdir -p logs && chown -R appuser:appuser /home/appuser/app/logs

# Ensure the appuser owns the directory
RUN chown -R appuser:appuser /home/appuser

# Switch to the non-privileged user
USER appuser

# Expose the port FastAPI will run on
EXPOSE 8000

# Start the application using gunicorn with uvicorn workers for production performance
# We use the PORT environment variable provided by Render, defaulting to 8000
CMD ["sh", "-c", "gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000}"]
