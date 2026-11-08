DROP POLICY IF EXISTS "Authenticated can receive realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;

CREATE POLICY "Users can subscribe only to their own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%');

CREATE POLICY "Users can broadcast only to their own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%');