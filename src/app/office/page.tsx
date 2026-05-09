import { Suspense } from "react";
import SalesBoard from "@/components/office/SalesBoard";
import NewDeliveryForm from "@/components/office/NewDeliveryForm";

export default function OfficePage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 sm:gap-6">
      <SalesBoard />
      <Suspense fallback={<div className="bg-white rounded-xl border border-gray-200 p-6" />}>
        <NewDeliveryForm />
      </Suspense>
    </div>
  );
}
