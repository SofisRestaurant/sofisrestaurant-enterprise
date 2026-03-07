import { useEffect, useState } from "react";
import {
  getCampaignAutomationStatus,
  setAutoRotateDaily,
  runCampaignRotation,
} from "@/features/admin/growth/campaigns.admin.service";

type Status = {
  autoRotate: boolean;
  lastRotationAt: string | null;
};

export default function CampaignAutomation() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);

  async function load() {
    const s = await getCampaignAutomationStatus();
    setStatus(s);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!status) {
    return <div className="p-6 text-sm text-gray-500">Loading automation status…</div>;
  }

  return (
    <div className="max-w-3xl p-6 space-y-6">
      <h1 className="text-xl font-semibold">Campaign Automation</h1>

      <div className="border rounded-xl p-4 space-y-3">
        <div className="text-sm text-gray-600">Automation status</div>

        <div className="flex items-center justify-between">
          <span>Auto rotate daily</span>

          <input
            type="checkbox"
            checked={status.autoRotate}
            onChange={async (e) => {
              const enabled = e.target.checked;
              await setAutoRotateDaily(enabled);
              setStatus({ ...status, autoRotate: enabled });
            }}
          />
        </div>

        <div className="text-xs text-gray-500">
          Last rotation:{" "}
          {status.lastRotationAt
            ? new Date(status.lastRotationAt).toLocaleString()
            : "never"}
        </div>

        <button
          className="px-4 py-2 rounded-lg bg-black text-white text-sm"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            await runCampaignRotation();
            await load();
            setRunning(false);
          }}
        >
          Run rotation now
        </button>
      </div>
    </div>
  );
}