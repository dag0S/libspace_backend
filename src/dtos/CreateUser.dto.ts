import { Role } from "@prisma/client";

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  avatarURL?: string;
  email: string;
  password: string;
  role: Role;
}
