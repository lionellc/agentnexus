import * as React from "react";
import { Button as SemiButton } from "@douyinfe/semi-ui-19";
import { cva } from "class-variance-authority";

import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  type?: "button" | "submit" | "reset";
  loading?: boolean;
}

function mapSemiButtonProps(variant: ButtonProps["variant"]) {
  if (variant === "outline") {
    return { theme: "light" as const, type: "tertiary" as const };
  }
  if (variant === "ghost") {
    return { theme: "borderless" as const, type: "tertiary" as const };
  }
  if (variant === "destructive") {
    return { theme: "solid" as const, type: "danger" as const };
  }
  if (variant === "secondary") {
    return { theme: "light" as const, type: "secondary" as const };
  }
  return { theme: "solid" as const, type: "primary" as const };
}

function mapSemiButtonSize(size: ButtonProps["size"]) {
  if (size === "sm") {
    return "small" as const;
  }
  if (size === "lg") {
    return "large" as const;
  }
  return "default" as const;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    const semiProps = mapSemiButtonProps(variant);
    return (
      <SemiButton
        className={cn(buttonVariants({ variant, size }), className)}
        htmlType={type}
        size={mapSemiButtonSize(size)}
        {...semiProps}
        {...props}
        ref={ref as any}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
