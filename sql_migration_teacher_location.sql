-- ============================================
-- MIGRATION: Add Teacher Location Support
-- Temporary solution until classroom coordinates are configured
-- ============================================

-- Add teacher location columns to sessions table
alter table sessions 
add column if not exists teacher_latitude decimal(10, 8),
add column if not exists teacher_longitude decimal(11, 8),
add column if not exists location_captured_at timestamp with time zone,
add column if not exists use_teacher_location boolean default true;  -- Feature flag

-- Create index for faster queries
create index if not exists idx_sessions_teacher_location on sessions(use_teacher_location);

-- Update existing sessions to use teacher location by default
update sessions 
set use_teacher_location = true 
where use_teacher_location is null;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
/*
select 
    id,
    subject,
    teacher_latitude,
    teacher_longitude,
    location_captured_at,
    use_teacher_location
from sessions
order by created_at desc
limit 5;
*/
