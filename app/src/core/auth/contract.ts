export type AdminSession = {
  email: string;
  name: string | null;
  picture: string | null;
};

export type SessionResponse = {
  session: AdminSession | null;
};
