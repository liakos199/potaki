import { z } from 'zod';

export const UserRoleSchema = z.enum(['customer', 'staff', 'owner']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: UserRoleSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
