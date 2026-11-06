CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  banker smallint NOT NULL,
  tie smallint NOT NULL,
  player smallint NOT NULL,
  winner text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own signals read" ON public.signals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own signals insert" ON public.signals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own signals delete" ON public.signals FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX signals_user_created_idx ON public.signals (user_id, created_at DESC);

CREATE TABLE public.private_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.private_settings TO authenticated;
GRANT ALL ON public.private_settings TO service_role;
ALTER TABLE public.private_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active users read private settings" ON public.private_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));