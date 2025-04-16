import { z } from 'zod';

export const DRINK_TYPES = ['single-drink', 'bottle'] as const;
export type DrinkType = (typeof DRINK_TYPES)[number];

export const DrinkOptionSchema = z.object({
  id: z.string(),
  bar_id: z.string(),
  type: z.enum(DRINK_TYPES),
  name: z.string().optional(), // Only for bottle
  price: z.number().min(0.01, 'Price must be positive'),
});

export type DrinkOption = z.infer<typeof DrinkOptionSchema>;
