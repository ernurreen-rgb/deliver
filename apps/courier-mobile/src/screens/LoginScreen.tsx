import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AuthUser } from "@deliver/contracts/auth";
import { courierApi } from "../api/client";
import { API_BASE_URL } from "../api/config";
import { ActionButton, InlineNotice } from "../components/ui";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (input: { token: string; user: AuthUser }) => Promise<void>;
}) {
  const [phone, setPhone] = useState("+77000000003");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeWasRequested = devCode !== null || code.length > 0;

  async function requestCode() {
    setIsRequesting(true);
    setError(null);
    try {
      const response = await courierApi.requestOtp(phone);
      setDevCode(response.devCode ?? "");
      if (response.devCode) setCode(response.devCode);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsRequesting(false);
    }
  }

  async function verifyCode() {
    setIsVerifying(true);
    setError(null);
    try {
      const response = await courierApi.verifyOtp(phone, code);
      const isCourier = response.user.roles.some(
        (role) => role === "courier" || role === "admin",
      );

      if (!isCourier) {
        await courierApi.logout(response.accessToken);
        setError("Для входа нужен аккаунт курьера.");
        return;
      }

      await onAuthenticated({ token: response.accessToken, user: response.user });
    } catch (verifyError) {
      setError(getErrorMessage(verifyError));
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Text style={styles.wordmark}>Deliver Courier</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Заказы и маршруты в одном месте
          </Text>
          <Text style={styles.description}>
            Войдите по номеру курьера. В локальном MVP используется пилотный код
            без SMS.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.step}>1. Получить код</Text>
          <Text style={styles.label}>Телефон</Text>
          <TextInput
            accessibilityLabel="Телефон"
            autoComplete="tel"
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="+77000000000"
            placeholderTextColor={colors.subdued}
            style={styles.input}
            testID="courier-login-phone-input"
            value={phone}
          />
          <ActionButton
            accessibilityLabel="Получить код"
            loading={isRequesting}
            onPress={requestCode}
            testID="courier-request-otp-button"
          >
            Получить код
          </ActionButton>

          {codeWasRequested ? (
            <View style={styles.dividerBlock}>
              <Text style={styles.step}>2. Подтвердить вход</Text>
              {devCode ? (
                <InlineNotice tone="info">
                  Dev-код подставлен автоматически.
                </InlineNotice>
              ) : null}
              <Text style={styles.label}>Код</Text>
              <TextInput
                accessibilityLabel="Код входа"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.subdued}
                style={styles.input}
                testID="courier-login-code-input"
                value={code}
              />
              <ActionButton
                accessibilityLabel="Войти"
                disabled={!code.trim()}
                loading={isVerifying}
                onPress={verifyCode}
                testID="courier-verify-otp-button"
              >
                Войти
              </ActionButton>
            </View>
          ) : null}

          {error ? <InlineNotice>{error}</InlineNotice> : null}
        </View>

        <Text style={styles.apiHint}>API: {API_BASE_URL}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  brandBlock: { marginBottom: spacing.lg },
  wordmark: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  title: {
    color: colors.foreground,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: spacing.sm,
  },
  description: {
    color: colors.subdued,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  step: { color: colors.foreground, fontSize: 18, fontWeight: "700" },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  dividerBlock: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  apiHint: {
    color: colors.subdued,
    fontSize: 11,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
