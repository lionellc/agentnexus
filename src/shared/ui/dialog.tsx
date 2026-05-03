import * as React from "react";
import { Modal } from "@douyinfe/semi-ui-19";

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

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within <Dialog>");
  }
  return context;
}

interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
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

  return <DialogContext.Provider value={{ open: actualOpen, setOpen }}>{children}</DialogContext.Provider>;
}

interface DialogTriggerProps {
  children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
}

function DialogTrigger({ children }: DialogTriggerProps) {
  const { setOpen } = useDialogContext();
  return React.cloneElement(children, {
    onClick: (event) => {
      children.props.onClick?.(event);
      setOpen(true);
    },
  });
}

interface DialogCloseProps {
  children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
}

function DialogClose({ children }: DialogCloseProps) {
  const { setOpen } = useDialogContext();
  return React.cloneElement(children, {
    onClick: (event) => {
      children.props.onClick?.(event);
      setOpen(false);
    },
  });
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("overlay-backdrop", className)} {...props} />
));
DialogOverlay.displayName = "DialogOverlay";

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  overlayClassName?: string;
  size?: "small" | "medium" | "large" | "full-width";
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, overlayClassName: _overlayClassName, size = "medium", ...props }, ref) => {
    const { open, setOpen } = useDialogContext();

    if (!open) {
      return null;
    }

    return (
      <Modal
        visible={open}
        title={null}
        footer={null}
        closable
        maskClosable
        size={size}
        onCancel={() => setOpen(false)}
        className={cn("bg-background text-foreground", className)}
        bodyStyle={{ padding: 0 }}
      >
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className="relative p-6"
          {...props}
        >
          {children}
        </div>
      </Modal>
    );
  },
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-3 flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-4 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h2 ref={ref} className={cn("text-lg font-semibold leading-none", className)} {...props} />,
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />,
);
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
