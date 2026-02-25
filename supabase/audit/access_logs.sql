CREATE TABLE IF NOT EXISTS audit.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON audit.access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON audit.access_logs(created_at DESC);
