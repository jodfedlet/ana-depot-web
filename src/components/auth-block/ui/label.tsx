"use client"

/**
 * shadcn/ui `label`, copied from the shadcn registry (https://ui.shadcn.com/r/styles/new-york-v4/label.json), which is the registry dependency
 * `label` of the Supabase UI block `password-based-auth-nextjs` (https://supabase.com/ui/r/password-based-auth-nextjs.json).
 * No edits: this is the registry file, only the `cn` import path differs.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
