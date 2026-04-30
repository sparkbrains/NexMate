import { cn } from "../../utils/cn";

const VARIANT_CLASS = {
  default: "ui-button--default",
  outline: "ui-button--outline",
  secondary: "ui-button--secondary",
  ghost: "ui-button--ghost",
  destructive: "ui-button--destructive",
  link: "ui-button--link",
};

const SIZE_CLASS = {
  xs: "ui-button--xs",
  sm: "ui-button--sm",
  default: "ui-button--default-size",
  lg: "ui-button--lg",
  icon: "ui-button--icon",
  "icon-xs": "ui-button--icon-xs",
  "icon-sm": "ui-button--icon-sm",
  "icon-lg": "ui-button--icon-lg",
};

export function Button({
  className = "",
  variant = "default",
  size = "default",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn("ui-button", VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      {...props}
    />
  );
}
