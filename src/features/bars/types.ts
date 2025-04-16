export type Bar = {
  id: string;
  name: string;
  address: string;
  phone: string;
  website?: string;
  description?: string;
  location: string; // WKT format: 'POINT(lon lat)'
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type CreateBarInput = {
  name: string;
  address: string;
  phone: string;
  website?: string;
  description?: string;
  location: string; // WKT format: 'POINT(lon lat)'
};

export type UpdateBarInput = {
  id: string;
  name: string;
  address: string;
  phone: string;
  website?: string;
  description?: string;
  location: string; // WKT format: 'POINT(lon lat)'
};
