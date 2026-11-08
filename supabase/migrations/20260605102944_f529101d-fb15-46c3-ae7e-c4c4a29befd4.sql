
-- Enable RLS on realtime.messages and restrict to authenticated users.
-- For postgres_changes broadcasts, the underlying table's RLS still
-- determines which rows each user actually receives, so this is a
-- defense-in-depth gate on channel subscription itself.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can send realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
