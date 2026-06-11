// Behavior-first pre-feed onboarding: sequences Splash → Location → Vibes, then
// hands the guest's selections to the App root via onDone (which enters guest
// browse). No account is created here — signup is earned later (Phase 2).
import React, { useState } from "react";
import { SplashScreen } from "./SplashScreen";
import { LocationPrimeScreen } from "./LocationPrimeScreen";
import { VibePickerScreen } from "./VibePickerScreen";

type Step = "splash" | "location" | "vibes";

export const PreFeedOnboarding: React.FC<{
  onDone: (guest: { hood: string | null; vibes: string[] }) => void;
}> = ({ onDone }) => {
  const [step, setStep] = useState<Step>("splash");
  const [hood, setHood] = useState<string | null>(null);
  const [vibes, setVibes] = useState<string[]>([]);
  const [locationDenied, setLocationDenied] = useState(false);

  if (step === "splash") {
    return <SplashScreen onStart={() => setStep("location")} />;
  }
  if (step === "location") {
    return (
      <LocationPrimeScreen
        onBack={() => setStep("splash")}
        onContinue={() => setStep("vibes")}
        hood={hood}
        setHood={setHood}
        locationDenied={locationDenied}
        setLocationDenied={setLocationDenied}
      />
    );
  }
  return (
    <VibePickerScreen
      onBack={() => setStep("location")}
      onContinue={() => onDone({ hood, vibes })}
      vibes={vibes}
      setVibes={setVibes}
    />
  );
};
