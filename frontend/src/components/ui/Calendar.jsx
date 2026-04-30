import { DayButton as DayPickerDayButton, DayPicker } from "react-day-picker";
import { cn } from "../../utils/cn";

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarChevron({ className, orientation = "left", ...props }) {
  const rotation = {
    up: "-90",
    right: "0",
    down: "90",
    left: "180",
  }[orientation];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("ui-calendar-chevron-icon", className)}
      style={{ transform: `rotate(${rotation}deg)` }}
      {...props}
    >
      <path d="M8 5l8 7-8 7" />
    </svg>
  );
}

function CalendarDayButton({ className, day, metaByDay, renderDayMeta, ...props }) {
  const meta = metaByDay[formatDayKey(day.date)];

  return (
    <DayPickerDayButton
      {...props}
      className={cn(
        className,
        meta && "ui-calendar-day-button--has-meta",
        meta && `ui-calendar-day-button--${meta.tone || "neutral"}`
      )}
    >
      <span className="ui-calendar-day-number">{day.date.getDate()}</span>
      {meta && renderDayMeta ? renderDayMeta(meta, day.date) : null}
    </DayPickerDayButton>
  );
}

export function Calendar({
  className = "",
  classNames = {},
  components = {},
  dayMetaByDate = {},
  renderDayMeta,
  showOutsideDays = true,
  ...props
}) {
  const mergedComponents = {
    Chevron: CalendarChevron,
    ...components,
  };

  if (renderDayMeta) {
    mergedComponents.DayButton = (dayButtonProps) => (
      <CalendarDayButton
        {...dayButtonProps}
        metaByDay={dayMetaByDate}
        renderDayMeta={renderDayMeta}
      />
    );
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("ui-calendar", className)}
      classNames={{
        root: "ui-calendar-root",
        months: "ui-calendar-months",
        month: "ui-calendar-month",
        month_caption: "ui-calendar-month-caption",
        caption_label: "ui-calendar-caption-label",
        nav: "ui-calendar-nav",
        button_previous: "ui-calendar-nav-button ui-calendar-nav-button--previous",
        button_next: "ui-calendar-nav-button ui-calendar-nav-button--next",
        month_grid: "ui-calendar-month-grid",
        weekdays: "ui-calendar-weekdays",
        weekday: "ui-calendar-weekday",
        weeks: "ui-calendar-weeks",
        week: "ui-calendar-week",
        day: "ui-calendar-day",
        day_button: "ui-calendar-day-button",
        today: "ui-calendar-day--today",
        selected: "ui-calendar-day--selected",
        outside: "ui-calendar-day--outside",
        disabled: "ui-calendar-day--disabled",
        hidden: "ui-calendar-day--hidden",
        chevron: "ui-calendar-chevron",
        ...classNames,
      }}
      components={mergedComponents}
      {...props}
    />
  );
}
