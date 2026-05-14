// src/modules/checkout/components/page/SmsToggleSwitch.tsx

import { cx } from './cx';

type SmsToggleSwitchProps = {
  checked: boolean;
  onChange: () => void;
  label?: string;
};

export function SmsToggleSwitch({
  checked,
  onChange,
  label = 'Text me when ready',
}: SmsToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? `Turn off ${label}` : `Turn on ${label}`}
      onClick={onChange}
      className={cx('sms-toggle-switch', checked && 'sms-toggle-switch--checked')}
    >
      <span className="sms-toggle-switch__thumb" aria-hidden="true" />
    </button>
  );
}