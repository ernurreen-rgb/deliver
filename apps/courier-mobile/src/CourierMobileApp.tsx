import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { AuthUser } from "@deliver/contracts/auth";
import type { CourierDashboardResponse } from "@deliver/contracts/courier";
import { courierApi } from "./api/client";
import {
  clearSessionToken,
  readSessionToken,
  saveSessionToken,
} from "./auth/session-store";
import { LoadingState } from "./components/ui";
import { CourierDashboardScreen } from "./screens/CourierDashboardScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { colors } from "./theme";

function hasCourierAccess(user: AuthUser) {
  return user.roles.some((role) => role === "courier" || role === "admin");
}

export function CourierMobileApp() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<CourierDashboardResponse | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    void readSessionToken().then(async (storedToken) => {
      if (!storedToken) {
        if (active) setToken(null);
        return;
      }

      try {
        const session = await courierApi.getSession(storedToken);
        if (!hasCourierAccess(session.user)) throw new Error("Courier role required");
        const restoredDashboard = await courierApi.getDashboard(storedToken);

        if (active) {
          setUser(session.user);
          setDashboard(restoredDashboard);
          setToken(storedToken);
        }
      } catch {
        await clearSessionToken();
        if (active) setToken(null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function authenticate(input: { token: string; user: AuthUser }) {
    const initialDashboard = await courierApi.getDashboard(input.token);
    await saveSessionToken(input.token);
    setUser(input.user);
    setDashboard(initialDashboard);
    setToken(input.token);
  }

  async function logout() {
    if (token) {
      try {
        await courierApi.logout(token);
      } catch {
        // The local token is still removed even if the API cannot be reached.
      }
    }

    await clearSessionToken();
    setToken(null);
    setUser(null);
    setDashboard(null);
  }

  let content;

  if (token === undefined) {
    content = <LoadingState label="Проверяем сессию…" />;
  } else if (!token || !user) {
    content = <LoginScreen onAuthenticated={authenticate} />;
  } else if (!dashboard) {
    content = <LoadingState label="Загружаем смену…" />;
  } else {
    content = (
      <CourierDashboardScreen
        initialDashboard={dashboard}
        onDashboard={setDashboard}
        onLogout={logout}
        token={token}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.root}>
        {content}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
});
