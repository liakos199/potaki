/**
 * Represents a Bar record fetched from the database.
 */
export type Bar = {
  id: string; // uuid
  name: string; // text
  owner_id: string; // uuid
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
  address: string; // character varying(255)
  phone: string | null; // character varying(20) null
  website: string | null; // character varying(255) null
  description: string | null; // text null
  location: string; // geography (represented as WKT string: 'POINT(lon lat)')
  reservation_hold_until: string | null; // time without time zone null (e.g., "18:00:00")
  live: boolean; // boolean
};

/**
 * Represents the input data required to create a new Bar.
 * owner_id must be provided (usually from the authenticated user).
 * id, created_at, updated_at are handled by the database.
 */
export type CreateBarInput = {
  name: string;
  owner_id: string; // Must provide the owner
  address: string;
  location: string; // WKT format: 'POINT(lon lat)'
};

/**
 * Represents the input data allowed to update an existing Bar.
 * id is required to identify the bar.
 * All other fields are optional, only include the ones you want to change.
 * Use `null` to explicitly clear nullable fields like phone, website, description, reservation_hold_until.
 */
export type UpdateBarInput = {
  id: string; // Required to identify the bar
  name?: string;
  address?: string;
  location?: string; // WKT format: 'POINT(lon lat)'
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  reservation_hold_until?: string | null; // e.g., "18:00:00"
  live?: boolean;
  // owner_id is not updated here
  // created_at, updated_at are handled by the database
};