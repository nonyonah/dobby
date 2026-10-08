import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
    </div>
  );
}
