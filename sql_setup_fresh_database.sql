-- ============================================
-- COMPLETE DATABASE SETUP FOR NEW INSTALLATIONS
-- ============================================
-- Run this if you are setting up a FRESH database
-- This creates all tables with the new schema from scratch
-- ============================================

-- 1. Branches
-- Stores academic branches (e.g., COMPUTER, IT, etc.)
create table if not exists branches (name text primary key);
insert into branches (name) values ('COMPUTER') on conflict do nothing;

-- 2. Academic Years
-- Stores year levels (FE, SE, TE, BE)
create table if not exists academic_years (name text primary key);
insert into academic_years (name) values ('FE'), ('SE'), ('TE'), ('BE') on conflict do nothing;

-- 3. Divisions
-- Stores class divisions (A, B, C)
create table if not exists divisions (name text primary key);
insert into divisions (name) values ('A'), ('B'), ('C') on conflict do nothing;

-- 4. Classrooms
-- Stores room numbers with GPS coordinates for geofencing
-- latitude/longitude: GPS coordinates for geofence center
-- Room numbers: Floor 1-11, Rooms 01-10 (e.g., 101, 102, ... 1110)
create table if not exists classrooms (
  room_no text primary key,
  latitude decimal(10, 8),    -- GPS latitude (e.g., 19.0222)
  longitude decimal(11, 8)    -- GPS longitude (e.g., 72.8561)
);

-- Generate all classroom room numbers (101-1110)
do $$
begin
  for f in 1..11 loop
    for c in 1..10 loop
      insert into classrooms (room_no) values (f || lpad(c::text, 2, '0')) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- 5. Subjects Table
-- Stores course/subject information
create table if not exists subjects (
  code text primary key,
  name text not null,
  branch text references branches(name),
  year text references academic_years(name),
  semester text
);

-- 6. Insert Sample Subjects (COMPUTER branch, TE year)
insert into subjects (code, name, branch, year, semester) values
('CSC601', 'System Programming & Compiler Construction', 'COMPUTER', 'TE', 'VI'),
('CSC602', 'Cryptography & System Security', 'COMPUTER', 'TE', 'VI'),
('CSC603', 'Mobile Computing', 'COMPUTER', 'TE', 'VI'),
('CSC604', 'Artificial Intelligence', 'COMPUTER', 'TE', 'VI'),
('CSDLO6011', 'Internet of Things', 'COMPUTER', 'TE', 'VI'),
('CSL601', 'System Programming & Compiler Construction Lab', 'COMPUTER', 'TE', 'VI'),
('CSL602', 'Cryptography & System Security Lab', 'COMPUTER', 'TE', 'VI'),
('CSL603', 'Mobile Computing Lab', 'COMPUTER', 'TE', 'VI'),
('CSL604', 'Artificial Intelligence Lab', 'COMPUTER', 'TE', 'VI'),
('CSL605', 'Skill base Lab Course - Cloud Computing', 'COMPUTER', 'TE', 'VI'),
('CSM601', 'Mini Project Lab - 2B', 'COMPUTER', 'TE', 'VI')
on conflict (code) do nothing;

-- 7. Sessions Table
-- Stores attendance sessions with capture mode and geofencing settings
-- capture_mode: 'teacher' (default) = teacher captures students
--               'student' = students self-capture via link
-- geofence_radius: distance in meters (default 10m)
create table if not exists sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  teacher_id uuid references auth.users(id),
  branch text,
  year text,
  class_name text,           -- Room number reference
  division text,
  subject text,
  timing timestamp with time zone,
  status text default 'active',
  teacher_signature text,
  capture_mode text default 'teacher',  -- 'teacher' or 'student'
  geofence_radius integer default 10    -- radius in meters
);

-- 8. Students Table
-- Stores student information with face descriptors
-- face_descriptor: JSON array of 512-dim face embedding vector
create table if not exists students (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  roll_no text not null,
  branch text,
  year text,
  division text,
  face_descriptor text       -- JSON array of face embedding (512-dim)
);

-- 9. Attendance Records Table
-- Stores attendance marks with verification tracking
-- liveness_verified: true if passed anti-spoofing check
-- location_verified: true if within classroom geofence
-- student_latitude/longitude: GPS coords when marking attendance
-- distance_from_classroom: calculated distance in meters
-- verification_method: 'manual', 'face_recognition', or 'student_self_capture'
create table if not exists attendance_records (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  session_id uuid references sessions(id),
  student_id uuid references students(id),
  timestamp timestamp with time zone default timezone('utc'::text, now()),
  liveness_verified boolean default false,
  location_verified boolean default false,
  student_latitude decimal(10, 8),
  student_longitude decimal(11, 8),
  distance_from_classroom decimal(10, 2), -- distance in meters
  verification_method text default 'manual', -- 'manual', 'face_recognition', 'student_self_capture'
  constraint unique_session_student unique(session_id, student_id)
);

-- 10. Enable Row Level Security (RLS)
alter table sessions enable row level security;
alter table students enable row level security;
alter table attendance_records enable row level security;
alter table branches enable row level security;
alter table academic_years enable row level security;
alter table divisions enable row level security;
alter table classrooms enable row level security;
alter table subjects enable row level security;

-- 11. Create RLS Policies
-- Public read access for lookup tables
create policy "Public Read" on branches for select using (true);
create policy "Public Read" on academic_years for select using (true);
create policy "Public Read" on divisions for select using (true);
create policy "Public Read" on classrooms for select using (true);
create policy "Public Read" on subjects for select using (true);

-- Sessions: authenticated users can manage, public can read
create policy "Enable all for authenticated" on sessions for all using (auth.role() = 'authenticated');
create policy "Public read sessions" on sessions for select using (true);

-- Students: authenticated users can manage, public can read
create policy "Enable all for authenticated" on students for all using (auth.role() = 'authenticated');
create policy "Public read students" on students for select using (true);

-- Attendance records: authenticated users can manage, public can read/insert
create policy "Enable all for authenticated" on attendance_records for all using (auth.role() = 'authenticated');
create policy "Public read attendance" on attendance_records for select using (true);
create policy "Public insert attendance" on attendance_records for insert with check (true);

-- 12. Create Indexes for Performance
create index idx_sessions_capture_mode on sessions(capture_mode);
create index idx_attendance_liveness on attendance_records(liveness_verified);
create index idx_attendance_location on attendance_records(location_verified);
create index idx_attendance_method on attendance_records(verification_method);
create index idx_sessions_teacher on sessions(teacher_id);
create index idx_sessions_status on sessions(status);
create index idx_attendance_session on attendance_records(session_id);
create index idx_attendance_student on attendance_records(student_id);
create index idx_students_roll on students(roll_no);
create index idx_students_class on students(branch, year, division);

-- ============================================
-- SAMPLE DATA INSERTION (Optional)
-- ============================================

-- Example: Set coordinates for a classroom (Room 101)
-- Replace with actual GPS coordinates of your classrooms
/*
update classrooms 
set latitude = 19.022222, longitude = 72.856111 
where room_no = '101';
*/

-- Example: Insert a test student
/*
insert into students (name, roll_no, branch, year, division, face_descriptor)
values (
  'John Doe', 
  '30', 
  'COMPUTER', 
  'TE', 
  'A',
  '[0.1, 0.2, 0.3, ...]'  -- 512-dim array
);
*/
