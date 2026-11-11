"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthModal } from "./AuthModal";
import AccountMenu from "@/components/ui/AccountMenu";

const AuthButton = ({ user, profile }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (user) {
    return <AccountMenu user={user} profile={profile} />;
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
