-- Add location columns to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS teacher_latitude double precision,
ADD COLUMN IF NOT EXISTS teacher_longitude double precision,
ADD COLUMN IF NOT EXISTS use_teacher_location boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS geofence_radius double precision DEFAULT 10;

-- Optional: Add NOT NULL constraint if you want to strictly enforce it
-- ALTER TABLE sessions ALTER COLUMN teacher_latitude SET NOT NULL;
-- ALTER TABLE sessions ALTER COLUMN teacher_longitude SET NOT NULL;

-- Create index for faster geofence lookups (future proofing)
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_location ON sessions(teacher_latitude, teacher_longitude);
