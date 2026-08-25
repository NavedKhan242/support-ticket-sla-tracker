export async function hashPassword(password: string): Promise<string> {
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}
