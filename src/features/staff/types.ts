export type CustomerProfile = {
  id: string;
  email: string;
  name?: string;
};

export type StaffProfile = {
  id: string;
  email: string;
  name?: string;
  role: 'staff';
  bar_id: string;
};
