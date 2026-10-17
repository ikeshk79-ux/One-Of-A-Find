"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// The app's theme is the `dark` class on <html> (index.html or a toggle), never the viewer's OS setting.
const subscribeToDocumentTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const getDocumentTheme = (): ToasterProps["theme"] =>
  document.documentElement.classList.contains("dark") ? "dark" : "light"

const getServerTheme = (): ToasterProps["theme"] => "light"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSyncExternalStore(subscribeToDocumentTheme, getDocumentTheme, getServerTheme)

  return (
    <Sonner
      theme={theme}
      // bottom-right: top positions sit on the header nav and swallow clicks; bottom-left is the preview bug button
      position="bottom-right"
      // Mobile has a fixed bottom tab bar (BottomNavigation, ~64px tall + safe-area) that a
      // bottom-anchored toast would otherwise cover — raise toasts above it so volunteers can
      // still reach the Home/Finds/More tabs while a confirmation is on screen.
      mobileOffset={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))", right: "12px", left: "12px" }}
      // Default visible duration (ms). Sonner's own default is 4s which lingers on
      // confirmation-style toasts ("Photo captured", "Saved to Finds") that volunteers glance
      // at once and move on from. 1.8s is long enough to read a 2-3 word confirmation and short
      // enough to not overlap the next step. Individual callers can override by passing
      // `{ duration: Nms }` on toast.success/error/info.
      duration={1800}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
