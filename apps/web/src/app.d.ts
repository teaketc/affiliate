import type { UserDto } from '@affiliate/shared';

declare global {
  namespace App {
    interface Locals {
      token: string | null;
      user: UserDto | null;
    }
    interface Error {
      message: string;
      code?: string;
      requestId?: string;
    }
  }
}

export {};
