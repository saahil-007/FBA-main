-- Update precision for location columns in sessions table
-- Using numeric(9,6) ensures 6 decimal places of precision (approx 11cm accuracy)
-- while allowing for standard latitude/longitude ranges

-- teacher_latitude
ALTER TABLE sessions 
ALTER COLUMN teacher_latitude TYPE numeric(9,6) 
USING teacher_latitude::numeric(9,6);

-- teacher_longitude
ALTER TABLE sessions 
ALTER COLUMN teacher_longitude TYPE numeric(9,6) 
USING teacher_longitude::numeric(9,6);

-- Add explicit check constraints to ensure valid coordinate ranges
ALTER TABLE sessions 
ADD CONSTRAINT check_teacher_latitude 
CHECK (teacher_latitude BETWEEN -90 AND 90);

ALTER TABLE sessions 
ADD CONSTRAINT check_teacher_longitude 
CHECK (teacher_longitude BETWEEN -180 AND 180);

-- Create a comment explaining the precision
COMMENT ON COLUMN sessions.teacher_latitude IS 'Teacher latitude with 6 decimal places (approx 11cm precision)';
COMMENT ON COLUMN sessions.teacher_longitude IS 'Teacher longitude with 6 decimal places (approx 11cm precision)';
