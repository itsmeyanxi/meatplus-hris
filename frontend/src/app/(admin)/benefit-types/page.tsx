"use client";

import { ReferenceListManager } from "@/components/settings/ReferenceListManager";

export default function BenefitTypesPage() {
  return (
    <ReferenceListManager
      category="benefit_type"
      title="Benefits Type"
      description="Benefit types used on employee benefit enrolments."
      nameLabel="Benefit type"
    />
  );
}
