"use client";

import { ReferenceListManager } from "@/components/settings/ReferenceListManager";

export default function WorkLocationsPage() {
  return (
    <ReferenceListManager
      category="work_location"
      title="Work Location"
      description="Work locations / worksites employees can be assigned to."
      nameLabel="Work location"
    />
  );
}
