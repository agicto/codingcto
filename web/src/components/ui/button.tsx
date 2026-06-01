/**
 * @component Button
 * @category UI
 * @status Stable
 * @description A highly customizable button component with support for variants, sizes, loading states, and icons.
 * @usage Use for primary actions, forms, or navigation triggers. Supports 'asChild' for semantic flexibility.
 * @example
 * <Button variant="default" size="md" loading={isLoading} onClick={handleClick}>
 *   Click Me
 * </Button>
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-semibold focus-ring shrink-0 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-none button-lighting hover:bg-[var(--cto-focus-blue)] active:scale-95",
        destructive:
          "bg-destructive text-white shadow-button-destructive button-destructive-lighting hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline:
          "border border-border-main bg-bg-surface text-primary shadow-none hover:bg-accent hover:text-primary dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-none hover:bg-primary-subtle",
        ghost:
          "hover:bg-secondary/80 hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-muted-foreground underline-offset-4 hover:text-primary hover:underline",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-5",
        lg: "h-11 px-6",
        xl: "h-12 px-8 text-base",
        "2xl": "h-14 px-10 text-lg",
      },
      isIcon: {
        true: "aspect-square p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      isIcon: false,
    },
  }
)

interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /**
   * If true, the button will render as its child element while keeping button styles.
   */
  asChild?: boolean
  /**
   * Displays a loading spinner and disables interaction.
   */
  loading?: boolean
  /**
   * An optional icon to display inside the button.
   */
  icon?: React.ReactNode
  /**
   * Positioning of the icon or loading spinner relative to children.
   * @default "left"
   */
  iconPosition?: "left" | "right"
  /**
   * Disables the scale transform on click. Use when Button is used as a DropdownMenuTrigger
   * to prevent dropdown jitter caused by transform conflicts.
   */
  noScale?: boolean
}

function Button({
  className,
  variant,
  size,
  isIcon,
  loading = false,
  asChild = false,
  icon,
  iconPosition = "left",
  noScale = false,
  children,
  ...props
}: ButtonProps) {
  const { disabled, onClick, type, ...restProps } = props
  const isDisabled = disabled || loading
  const contentClassName = cn(
    "inline-flex items-center gap-2",
    isIcon ? "justify-center" : "justify-inherit"
  )
  const buttonClassName = cn(
    buttonVariants({ variant, size, isIcon, className }),
    noScale ? "interactive-no-scale" : "interactive",
    loading && "relative pointer-events-none",
    asChild && isDisabled && "pointer-events-none"
  )

  const spinnerSize = cn(
    "animate-spin shrink-0",
    size === "xs" || size === "sm" ? "size-3" : 
    size === "xl" || size === "2xl" ? "size-6" : "size-4"
  )

  const spinner = <Loader2 className={spinnerSize} />

  if (asChild) {
    return (
      <Slot
        {...restProps}
        data-slot="button"
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : undefined}
        className={buttonClassName}
        {...(isDisabled || onClick
          ? {
              onClick: (event: React.MouseEvent<HTMLElement>) => {
                if (isDisabled) {
                  event.preventDefault()
                  event.stopPropagation()
                  return
                }
                onClick?.(event as React.MouseEvent<HTMLButtonElement>)
              },
            }
          : {})}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      data-slot="button"
      disabled={isDisabled}
      type={type}
      className={buttonClassName}
      onClick={onClick}
      {...restProps}
    >
      <span className={contentClassName}>
        {/* Left Slot: Show spinner if loading and position is left */}
        {iconPosition === "left" && (
          loading ? spinner : icon
        )}

        {/* Children Slot: Hidden only for isIcon buttons while loading */}
        {!(isIcon && loading) && children}

        {/* Right Slot: Show spinner if loading and position is right */}
        {iconPosition === "right" && (
          loading ? spinner : icon
        )}
      </span>
    </button>
  )
}

export { Button, buttonVariants }
