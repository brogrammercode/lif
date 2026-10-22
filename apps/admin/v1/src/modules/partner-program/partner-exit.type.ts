export type PartnerExit = {
  id: string;
  application_id: string;
  version: number;
  status: "REQUESTED" | "REVIEWING" | "REJECTED" | "COMPLETED";
  reason: string;
  admin_notes: string | null;
  rejection_reason: string | null;
  dues_amount: string | null;
  dues_direction: "DRIVER_OWES" | "PAYABLE_TO_DRIVER" | "SETTLED";
  currency: string;
  settlement_pdf_id: string | null;
  completed_at: string | null;
  manually_shared_at: string | null;
  created_at: string;
  application: {
    user_id: string;
    contact_email: string;
    whatsapp_phone: string;
    user: { first_name: string | null; last_name: string | null };
    deliveries: {
      status: string;
      attempts: number;
      sent_at: string | null;
      claimed_at: string | null;
      updated_at?: string | null;
      last_error: string | null;
    }[];
  };
};
