import Link from "next/link";

import { AdminOraclePanel } from "./AdminOraclePanel";
import { SignOutButton } from "./SignOutButton";

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-4 text-neutral-600">
        You are signed in. Use MetaMask below to update oracle price.
      </p>
      <AdminOraclePanel />
      <div className="mt-8">
        <SignOutButton />
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-blue-600 underline">
        Back to app
      </Link>
    </main>
  );
}
