export type Role = 'doctor' | 'collection_agent'
export type User = { id: number; full_name: string; email: string; phone_number: string | null; hospital_clinic_name?: string | null; role: string; approval_status: string; is_active: boolean }
export type Session = { access_token: string; user: User }
export type Permission = { screen: string; access_level: string }
export type CatalogItem = { id: number; name: string; category?: string | null }
export type Catalog = { tests: CatalogItem[]; packages: CatalogItem[] }
export type Referral = { id: number; patient_name: string; patient_age: number | null; patient_phone_number: string; patient_email?: string | null; recommendation_note?: string | null; assigned_lab_name?: string | null; status: string; booking_url: string; expires_at: string; created_at: string; tests: CatalogItem[]; packages: CatalogItem[]; messages: { channel: string; status: string; created_at: string }[]; booking?: { reference: string; status: string; payment_status: string; collection_date: string; collection_slot: string; created_at: string } | null }
export type ReferralCreate = { patient_name: string; patient_age: number | null; patient_phone_number: string; patient_email: string | null; lab_test_ids: number[]; package_ids: number[]; recommendation_note: string | null; prescription_storage_path: string | null; consent_to_contact: boolean }
export type Address = { full_name: string; phone_number?: string | null; address_line_1: string; address_line_2?: string | null; city: string; state: string; postal_code: string }
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'en_route' | 'arrived' | 'sample_collected' | 'handover_complete'
// Optional additive assignment data. Older backends still send names only.
// These fields must be populated by the assigned laboratory, never inferred.
export type CollectionTest = { id: number; name: string; quantity?: number; tube_requirements?: string | null; fasting_required?: boolean | null; fasting_instructions?: string | null; collection_instructions?: string | null }
export type CollectionPackage = { id: number; name: string; quantity?: number; fasting_required?: boolean | null; fasting_instructions?: string | null; collection_instructions?: string | null; tests?: CollectionTest[] | null }
export type AssignmentOrder = { id: number; order_number: string; status: string; payment_status: string; collection_date: string; collection_slot: string; collection_address: Address | null; tests: string[]; test_details?: CollectionTest[] | null; package_details?: CollectionPackage[] | null }
export type Assignment = { id: number; assignment_status: AssignmentStatus; notes: string | null; created_at: string; updated_at: string; assigned_by: { full_name: string }; order: AssignmentOrder }
export type Tracking = { id: number; title: string; status: string; description?: string | null; actor_name?: string | null; created_at: string }
export type ReferralDashboard = { total_referrals: number; qualified_referrals: number; pending_referrals: number; issued_rewards: number; recent_referrals: { id: number; referred_order_id: number | null; reward_coupon_code: string | null; status: string }[] }
