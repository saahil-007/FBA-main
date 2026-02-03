-- 1. Branches
create table if not exists branches (name text primary key);
insert into branches (name) values ('COMPUTER') on conflict do nothing;

-- 2. Academic Years
create table if not exists academic_years (name text primary key);
insert into academic_years (name) values ('FE'), ('SE'), ('TE'), ('BE') on conflict do nothing;

-- 3. Divisions
create table if not exists divisions (name text primary key);
insert into divisions (name) values ('A'), ('B'), ('C') on conflict do nothing;

-- 4. Classrooms (Floors 1-11, 10 rooms each)
create table if not exists classrooms (room_no text primary key);
do $$
begin
  for f in 1..11 loop
    for c in 1..10 loop
      insert into classrooms (room_no) values (f || lpad(c::text, 2, '0')) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- 5. Subjects Table
create table if not exists subjects (
  code text primary key,
  name text not null,
  branch text references branches(name),
  year text references academic_years(name),
  semester text
);

-- 6. Insert Subjects
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
create table if not exists sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  teacher_id uuid references auth.users(id),
  branch text,
  year text,
  class_name text,
  division text,
  subject text,
  timing timestamp with time zone,
  status text default 'active',
  teacher_signature text
);

-- 8. Students Table
create table if not exists students (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  roll_no text not null,
  branch text,
  year text,
  division text,
  face_descriptor text 
);

-- 9. Attendance Records Table
create table if not exists attendance_records (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  session_id uuid references sessions(id),
  student_id uuid references students(id),
  timestamp timestamp with time zone default timezone('utc'::text, now()),
  constraint unique_session_student unique(session_id, student_id)
);

-- 10. Enable RLS
alter table sessions enable row level security;
alter table students enable row level security;
alter table attendance_records enable row level security;
alter table branches enable row level security;
alter table academic_years enable row level security;
alter table divisions enable row level security;
alter table classrooms enable row level security;
alter table subjects enable row level security;

-- 11. Create Policies (Open for demo, restrict in prod)
create policy "Public Read" on branches for select using (true);
create policy "Public Read" on academic_years for select using (true);
create policy "Public Read" on divisions for select using (true);
create policy "Public Read" on classrooms for select using (true);
create policy "Public Read" on subjects for select using (true);

create policy "Enable all for authenticated" on sessions for all using (auth.role() = 'authenticated');
create policy "Public read sessions" on sessions for select using (true);

create policy "Enable all for authenticated" on students for all using (auth.role() = 'authenticated');
create policy "Public read students" on students for select using (true);

create policy "Enable all for authenticated" on attendance_records for all using (auth.role() = 'authenticated');
create policy "Public read attendance" on attendance_records for select using (true);
create policy "Public insert attendance" on attendance_records for insert with check (true);
