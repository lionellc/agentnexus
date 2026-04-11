import * as React from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "../lib/cn";

const OVERLAY_BLUR_CLASS = "overlay-blur-active";
const OVERLAY_BLUR_COUNT_KEY = "overlayBlurCount";

function acquireGlobalOverlayBlur() {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  const current = Number.parseInt(body.dataset[OVERLAY_BLUR_COUNT_KEY] ?? "0", 10);
  const next = Number.isFinite(current) ? current + 1 : 1;
  body.dataset[OVERLAY_BLUR_COUNT_KEY] = String(next);
  body.classList.add(OVERLAY_BLUR_CLASS);
}

function releaseGlobalOverlayBlur() {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  const current = Number.parseInt(body.dataset[OVERLAY_BLUR_COUNT_KEY] ?? "0", 10);
  const normalized = Number.isFinite(current) ? current : 0;
  const next = Math.max(0, normalized - 1);
  if (next === 0) {
    delete body.dataset[OVERLAY_BLUR_COUNT_KEY];
    body.classList.remove(OVERLAY_BLUR_CLASS);
    return;
  }
  body.dataset[OVERLAY_BLUR_COUNT_KEY] = String(next);
}

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet components must be used within <Sheet>");
  }
  return context;
}

interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Sheet({ open, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (!actualOpen) {
      return;
    }
    acquireGlobalOverlayBlur();
    return () => {
      releaseGlobalOverlayBlur();
    };
  }, [actualOpen]);

  return <SheetContext.Provider value={{ open: actualOpen, setOpen }}>{children}</SheetContext.Provider>;
}

interface SheetTriggerProps {
  children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
}

function SheetTrigger({ children }: SheetTriggerProps) {
  const { setOpen } = useSheetContext();
  return React.cloneElement(children, {
    onClick: (event) => {
      children.props.onClick?.(event);
      setOpen(true);
    },
  });
}

interface SheetCloseProps {
  children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
}

function SheetClose({ children }: SheetCloseProps) {
  const { setOpen } = useSheetContext();
  return React.cloneElement(children, {
    onClick: (event) => {
      children.props.onClick?.(event);
      setOpen(false);
    },
  });
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("fixed inset-0 z-50 overlay-backdrop animate-fade-in", className)} {...props} />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed z-50 bg-background p-6 shadow-lg border transition-transform animate-fade-in data-[state=open]:animate-slide-in-right",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b",
        bottom: "inset-x-0 bottom-0 border-t",
        left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(({ side, className, children, ...props }, ref) => {
  const { open, setOpen } = useSheetContext();

  if (!open) {
    return null;
  }

  return (
    <SheetPortal>
      <SheetOverlay onClick={() => setOpen(false)} />
      <div ref={ref} data-state="open" className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </SheetPortal>
  );
});
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-4 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />,
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />,
);
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
