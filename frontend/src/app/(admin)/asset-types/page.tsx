"use client";

import { ReferenceListManager } from "@/components/settings/ReferenceListManager";

export default function AssetTypesPage() {
  return (
    <ReferenceListManager
      category="asset_type"
      title="Assets"
      description="Asset categories used when issuing company items to employees."
      nameLabel="Asset category"
    />
  );
}
