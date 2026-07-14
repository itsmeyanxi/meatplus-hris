"use client";

import { useParams } from "next/navigation";
import { SectionShell } from "@/components/payroll/SectionShell";
import { AdvancesSection } from "@/components/payroll/AdvancesSection";
import { TrainingSection } from "@/components/payroll/TrainingSection";
import { AssetsSection } from "@/components/payroll/AssetsSection";
import {
  MemoSection,
  SeminarsSection,
  MovementSection,
  DocumentsSection,
  MedicalRecordsSection,
  RequirementsSection,
} from "@/components/payroll/EmployeeProfileSections";

const svg = (d: string) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const IconAdvances = () => svg("M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
const IconTraining = () => svg("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.958c.3.922-.755 1.688-1.539 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.784.57-1.838-.196-1.539-1.118l1.287-3.958a1 1 0 00-.364-1.118L2.012 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z");
const IconAssets = () => svg("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4");
const IconMemo = () => svg("M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z");
const IconSeminars = () => svg("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z");
const IconMovement = () => svg("M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0110-4.472M16 11l3 3 3-3m-3 3V4");
const IconDocuments = () => svg("M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z");
const IconMedical = () => svg("M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z");
const IconRequirements = () => svg("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4");

export default function EmployeeRecordsPage() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);

  return (
    <div className="space-y-4">
      <SectionShell index={1} icon={<IconAdvances />} title="Advances" description="Cash advances and loans, deducted over pay periods" defaultOpen={false}>
        <AdvancesSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={2} icon={<IconTraining />} title="Training" description="Seminars and trainings attended" defaultOpen={false}>
        <TrainingSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={3} icon={<IconAssets />} title="Assets" description="Company items issued to the employee" defaultOpen={false}>
        <AssetsSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={4} icon={<IconMemo />} title="Memo" description="Disciplinary actions, offenses & infractions" defaultOpen={false}>
        <MemoSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={5} icon={<IconSeminars />} title="Seminars Attended / Service Training Attended" description="Courses and service trainings" defaultOpen={false}>
        <SeminarsSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={6} icon={<IconMovement />} title="Movement" description="Promotions, transfers & other movements" defaultOpen={false}>
        <MovementSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={7} icon={<IconDocuments />} title="Documents" description="Uploaded employee documents" defaultOpen={false}>
        <DocumentsSection />
      </SectionShell>

      <SectionShell index={8} icon={<IconMedical />} title="Medical Records" description="Medical files & classifications" defaultOpen={false}>
        <MedicalRecordsSection employeeId={employeeId} />
      </SectionShell>

      <SectionShell index={9} icon={<IconRequirements />} title="Requirements" description="Pre-employment requirements checklist" defaultOpen={false}>
        <RequirementsSection employeeId={employeeId} />
      </SectionShell>
    </div>
  );
}
