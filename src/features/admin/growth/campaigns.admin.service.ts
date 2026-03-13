import { supabase } from '@/lib/supabase/supabaseClient';
import { invokeEdge } from '@/lib/supabase/invoke';

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
  await invokeEdge('run-campaign-rotation', {}, { method: 'POST' });
}