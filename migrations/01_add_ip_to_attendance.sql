-- Add ip_address column to attendance_records table
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS ip_address text;

-- Add index for faster IP lookups per session
CREATE INDEX IF NOT EXISTS idx_attendance_ip_session ON attendance_records(session_id, ip_address);

-- Add unique constraint to enforce one attendance per IP per session
-- Note: This might be too strict for shared networks (NAT/WiFi), but requested by user.
-- Use with caution.
ALTER TABLE attendance_records ADD CONSTRAINT unique_session_ip UNIQUE (session_id, ip_address);
