import SquishSwitch from './SquishSwitch/SquishSwitch'

/** FamilyCal-themed SquishSwitch sized for settings rows. */
export function SettingsSquishSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  compact = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  compact?: boolean
}) {
  return (
    <SquishSwitch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      width={compact ? 44 : 36}
      height={compact ? 28 : 20}
      radius={compact ? 14 : 12}
      trackColor="var(--toggle-off)"
      trackOnColor="var(--green)"
      thumbColor="var(--knob)"
      thumbOnColor="var(--knob)"
      stretch={28}
      hoverScale={1.02}
      colorDuration={240}
    />
  )
}
