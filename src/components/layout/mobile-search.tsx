"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { SearchBox } from "@/features/search/search-box";
import { useT } from "@/i18n/provider";

export function MobileSearch() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label={t("nav.searchOpen")} className="grid size-11 place-items-center rounded-full text-ink hover:bg-sand-100">
        <Search aria-hidden className="size-[1.4rem]" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("nav.searchTitle")} side="top">
        <SearchBox autoFocus inline onNavigate={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}
