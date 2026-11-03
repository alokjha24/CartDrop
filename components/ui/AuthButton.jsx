"use client";

import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthModal } from "./AuthModal";
import { signOut } from "@/app/actions/auth";

const AuthButton = ({ user }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (user) {
    return (
      <form action={signOut}>
        <Button
          size="sm"
          type="submit"
          aria-label="Sign out"
          className="gap-2 bg-[#F97316] text-white hover:bg-[#EA580C]"
        >
          <LogOut className="w-4 h-4" />
          <span className="max-[359px]:hidden">Sign Out</span>
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        onClick={() => setShowAuthModal(true)}
        aria-label="Sign in"
        className="gap-2 bg-[#F97316] text-white hover:bg-[#EA580C]"
      >
        <LogIn className="w-4 h-4" />
        <span className="max-[359px]:hidden">Sign In</span>
      </Button>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
};

export default AuthButton;
