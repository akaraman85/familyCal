DELETE FROM family_members
WHERE
  (id = 'alex' AND display_name = 'Alex Karaman' AND email = 'alex@karaman.family')
  OR (id = 'maya' AND display_name = 'Maya Karaman' AND email = 'maya@karaman.family')
  OR (id = 'leo' AND display_name = 'Leo Karaman' AND email IS NULL);
