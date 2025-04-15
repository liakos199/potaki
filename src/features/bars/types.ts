export type Bar = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type CreateBarInput = {
  name: string;
};

export type UpdateBarInput = {
  id: string;
  name: string;
};
