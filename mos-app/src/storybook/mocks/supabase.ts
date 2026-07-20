export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    signOut: async () => ({ error: null }),
  },
}
