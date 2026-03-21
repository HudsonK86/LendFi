export type AdminUser = {
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
};

export type AdminActionLog = {
  id: number;
  username: string;
  action: string;
  details: string | null;
  created_at: string;
};
