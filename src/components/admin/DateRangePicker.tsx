import { DateRangePicker as UIDateRangePicker } from "@/components/ui/DateRangePicker";

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from?: Date;
  to?: Date;
  onChange: (range: { from?: Date; to?: Date }) => void;
  className?: string;
}) {
  return (
    <UIDateRangePicker
      value={{ from, to }}
      onChange={(range) => onChange(range)}
      className={className}
    />
  );
}

