import SalesBoard from "@/components/office/SalesBoard";
import NewDeliveryForm from "@/components/office/NewDeliveryForm";

export default function OfficePage() {
  return (
    <div className="grid grid-cols-[1fr_380px] gap-6">
      <SalesBoard />
      <NewDeliveryForm />
    </div>
  );
}
