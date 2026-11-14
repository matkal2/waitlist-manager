-- Adds Accounting and Maintenance roles. Run in Supabase SQL Editor.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE user_profiles
ADD CONSTRAINT valid_role
CHECK (role IN ('admin', 'leasing_agent', 'property_manager', 'accounting', 'maintenance'));
