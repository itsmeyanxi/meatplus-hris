"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AttendanceLandingPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/attendance/dtr"); }, [router]);
  return null;
}
