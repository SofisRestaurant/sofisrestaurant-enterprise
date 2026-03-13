import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export type CampaignAutomationStatus = {
  autoRotate: boolean;
  lastRotationAt: string | null;
};

export async function getCampaignAutomationStatus(): Promise<CampaignAutomationStatus> {
  const { data, error } = await supabase
    .from('growth_campaign_settings')
    .select('auto_rotate_daily,last_rotation_at')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return { autoRotate: false, lastRotationAt: null };
  }

  return {
    autoRotate: Boolean(data.auto_rotate_daily),
    lastRotationAt: data.last_rotation_at,
  };
}

export async function setAutoRotateDaily(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('growth_campaign_settings')
    .update({ auto_rotate_daily: enabled })
    .eq('id', 1);

  if (error) throw error;
}

export async function runCampaignRotation(): Promise<void> {
  const { error } = await supabase.functions.invoke('run-campaign-rotation', {
    method: 'POST',
  });

  if (error) throw error;
}
