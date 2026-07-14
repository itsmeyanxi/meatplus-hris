"use client";

import { ReferenceListManager } from "@/components/settings/ReferenceListManager";

export default function VisaTypesPage() {
  return (
    <ReferenceListManager
      category="visa_type"
      title="Visa"
      description="Visa types used on employee visa records."
      nameLabel="Visa type"
    />
  );
}
