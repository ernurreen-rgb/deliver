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
import { customerApi } from "../api/client";
import { API_BASE_URL } from "../api/config";
import { ActionButton, InlineNotice } from "../components/ui";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (input: { token: string; user: AuthUser }) => Promise<void>;
}) {
  const [phone, setPhone] = useState("+77000000002");
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
      const response = await customerApi.requestOtp(phone);
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
      const response = await customerApi.verifyOtp(phone, code);
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
          <Text style={styles.wordmark}>Deliver</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Заказ еды без лишних шагов
          </Text>
          <Text style={styles.description}>
            Войдите по номеру телефона. В MVP используется пилотный код без SMS.
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
            testID="login-phone-input"
            value={phone}
          />
          <ActionButton
            accessibilityLabel="Получить код"
            loading={isRequesting}
            onPress={requestCode}
            testID="request-otp-button"
          >
            Получить код
          </ActionButton>

          {codeWasRequested ? (
            <View style={styles.dividerBlock}>
              <Text style={styles.step}>2. Подтвердить вход</Text>
              {devCode ? (
                <InlineNotice tone="info">Dev-код подставлен автоматически.</InlineNotice>
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
                testID="login-code-input"
                value={code}
              />
              <ActionButton
                accessibilityLabel="Войти"
                disabled={!code.trim()}
                loading={isVerifying}
                onPress={verifyCode}
                testID="verify-otp-button"
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
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  brandBlock: { marginBottom: spacing.lg },
  wordmark: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: "800",
  },
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
  step: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
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
