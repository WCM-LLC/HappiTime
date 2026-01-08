import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { supabase } from "./src/api/supabaseClient";
import { useMagicLinkListener } from "./src/hooks/useMagicLinkListener";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";

export default function App() {

  useEffect(() => {
  console.log("✅ App mounted");
  return () => console.log("❌ App unmounted");
}, []);

  useMagicLinkListener();
  console.log("App render");

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setBooting(false);
    });

const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
  if (!isMounted) return;                 // ✅ add this
  console.log("Auth change:", event, "session?", !!newSession);
  setSession(newSession ?? null);

  // ✅ Only end booting once we know INITIAL_SESSION ran
  if (event === "INITIAL_SESSION") setBooting(false);
});

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ✅ Always show something while booting
  if (booting) {
    console.log("booting:", booting, "session:", !!session);

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ If no session, ALWAYS show login flow
  if (!session) return <AuthScreen />;

  // ✅ Otherwise show app
  return <AppNavigator />;
}
