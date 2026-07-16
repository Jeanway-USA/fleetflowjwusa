import { toast as sonnerToast, type ExternalToast } from "sonner";

/**
 * Reusable toast notification system for FleetFlow.
 *
 * Built on `sonner` (already mounted globally in App.tsx at bottom-right).
 * Provides semantic success/error/warning/info variants, plus Undo and
 * generic action helpers. Fully dark-theme aware via richColors + CSS vars.
 *
 * Usage:
 *   import { notify } from "@/lib/notify";
 *   notify.success("Load created");
 *   notify.error("Failed to save", { description: err.message });
 *   notify.undo("Driver archived", () => restoreDriver(id));
 *
 * Or via the hook (identical API, provided for ergonomic parity):
 *   const notify = useNotify();
 */

type ToastId = string | number;

export type NotifyOptions = Pick<
  ExternalToast,
  "description" | "duration" | "id" | "important" | "position" | "dismissible"
>;

export type NotifyActionType = "default" | "destructive";

export interface NotifyAction {
  label: string;
  onClick: () => void;
  type?: NotifyActionType;
}

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 7000;
const UNDO_DURATION = 10000;

/**
 * Semantic toast API. Prefer this over calling `toast` from "sonner" directly
 * so styling, durations, and Undo behavior stay consistent across the app.
 */
export const notify = {
  /** Success toast (green). Default 4s. */
  success(message: string, opts?: NotifyOptions): ToastId {
    return sonnerToast.success(message, { duration: DEFAULT_DURATION, ...opts });
  },

  /** Error toast (red). Default 7s so users can read the reason. */
  error(message: string, opts?: NotifyOptions): ToastId {
    return sonnerToast.error(message, { duration: ERROR_DURATION, ...opts });
  },

  /** Warning toast (amber). Default 5s. */
  warning(message: string, opts?: NotifyOptions): ToastId {
    return sonnerToast.warning(message, { duration: 5000, ...opts });
  },

  /** Info toast (blue). Default 4s. */
  info(message: string, opts?: NotifyOptions): ToastId {
    return sonnerToast.info(message, { duration: DEFAULT_DURATION, ...opts });
  },

  /** Persistent loading toast — returns id, call `notify.dismiss(id)` when done. */
  loading(message: string, opts?: NotifyOptions): ToastId {
    return sonnerToast.loading(message, opts);
  },

  /**
   * Attach toasts to a promise lifecycle.
   *   notify.promise(saveLoad(), { loading: "Saving…", success: "Saved", error: "Failed" });
   */
  promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    },
  ) {
    return sonnerToast.promise(promise, msgs);
  },

  /**
   * Success toast with an Undo button. The callback only fires if the user
   * clicks Undo before the toast auto-dismisses (10s default).
   *
   *   notify.undo("Driver archived", () => restoreDriver(id));
   */
  undo(message: string, onUndo: () => void, opts?: NotifyOptions): ToastId {
    return sonnerToast.success(message, {
      duration: UNDO_DURATION,
      ...opts,
      action: {
        label: "Undo",
        onClick: onUndo,
      },
    });
  },

  /**
   * Toast with a custom action button.
   *
   *   notify.action("Load imported", { label: "View", onClick: () => nav("/loads/123") });
   *   notify.action("Delete failed", { label: "Retry", onClick: retry, type: "destructive" }, { description: err });
   */
  action(
    message: string,
    action: NotifyAction,
    opts?: NotifyOptions & { variant?: "success" | "error" | "warning" | "info" },
  ): ToastId {
    const { variant, ...rest } = opts ?? {};
    const fn =
      variant === "error"
        ? sonnerToast.error
        : variant === "warning"
          ? sonnerToast.warning
          : variant === "info"
            ? sonnerToast.info
            : variant === "success"
              ? sonnerToast.success
              : sonnerToast;
    return fn(message, {
      duration: DEFAULT_DURATION,
      ...rest,
      action: {
        label: action.label,
        onClick: action.onClick,
      },
    });
  },

  /** Dismiss a specific toast by id, or all toasts if no id passed. */
  dismiss(id?: ToastId) {
    sonnerToast.dismiss(id);
  },
};

export type Notify = typeof notify;

/** Hook alias — returns the same `notify` object. Provided for ergonomic parity. */
export function useNotify(): Notify {
  return notify;
}
