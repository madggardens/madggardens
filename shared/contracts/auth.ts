import { z } from 'zod';

export const appRoleSchema = z.enum(['user', 'admin']);

export const apiUserSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  role: appRoleSchema,
});

export const currentUserResponseSchema = z.object({
  data: apiUserSchema,
});

export const deleteAccountResponseSchema = z.object({
  data: z.object({ deleted: z.literal(true) }),
});

export type AppRole = z.infer<typeof appRoleSchema>;
export type ApiUser = z.infer<typeof apiUserSchema>;
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;
