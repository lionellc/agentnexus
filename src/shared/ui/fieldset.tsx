import {
  Description as HeadlessDescription,
  Field as HeadlessField,
  Fieldset as HeadlessFieldset,
  Label as HeadlessLabel,
  Legend as HeadlessLegend,
} from "@headlessui/react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

export function FormFieldset({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof HeadlessFieldset>) {
  return <HeadlessFieldset className={cn("space-y-3", className)} {...props} />;
}

export function FormLegend({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof HeadlessLegend>) {
  return <HeadlessLegend className={cn("text-sm font-medium text-slate-700", className)} {...props} />;
}

export function FormField({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof HeadlessField>) {
  return <HeadlessField className={cn("space-y-1", className)} {...props} />;
}

export function FormLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof HeadlessLabel>) {
  return <HeadlessLabel className={cn("block text-xs text-slate-500", className)} {...props} />;
}

export function FormDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof HeadlessDescription>) {
  return <HeadlessDescription className={cn("text-xs text-slate-500", className)} {...props} />;
}
