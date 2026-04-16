import { Trash2 } from "lucide-react";

import { cn } from "../lib/cn";
import { Button, type ButtonProps } from "./button";

type DeleteIconButtonProps = Omit<ButtonProps, "children"> & {
  label: string;
  iconClassName?: string;
};

export function DeleteIconButton({
  label,
  iconClassName,
  type = "button",
  variant = "outline",
  size = "icon",
  ...props
}: DeleteIconButtonProps) {
  return (
    <Button type={type} variant={variant} size={size} title={label} aria-label={label} {...props}>
      <Trash2 className={cn("h-4 w-4 text-red-600", iconClassName)} />
    </Button>
  );
}
