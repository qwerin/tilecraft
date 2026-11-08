import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, type ChevronProps } from "react-day-picker"
import { cs } from "react-day-picker/locale"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Měsíční kalendář (česky, týden od pondělí), vzhled podle tokenů motivu. */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={cs}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("p-1 [--cell-size:--spacing(8)]", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col gap-4",
        month: "flex w-full flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none aria-disabled:opacity-50"),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none aria-disabled:opacity-50"),
        month_caption: "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
        dropdowns: "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
        dropdown_root:
          "relative rounded-md border border-input has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50",
        dropdown: "absolute inset-0 cursor-pointer bg-popover opacity-0",
        caption_label: cn(
          "font-medium select-none",
          props.captionLayout?.startsWith("dropdown")
            ? "flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground"
            : "text-sm"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-(--cell-size) text-[0.8rem] font-normal text-muted-foreground select-none",
        week: "mt-1 flex w-full",
        day: "group/day relative size-(--cell-size) p-0 text-center text-sm select-none",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-(--cell-size) p-0 font-normal tabular-nums"
        ),
        today: "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-primary/60",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/85 [&>button]:hover:text-primary-foreground",
        outside: "text-muted-foreground [&>button]:text-muted-foreground/70",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron,
      }}
      {...props}
    />
  )
}

function Chevron({ className, orientation }: ChevronProps) {
  const Icon = orientation === "left" ? ChevronLeftIcon : orientation === "right" ? ChevronRightIcon : ChevronDownIcon
  return <Icon className={cn("size-4", className)} />
}

export { Calendar }
