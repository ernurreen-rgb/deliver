import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing } from "../theme";

export function AppHeader({
  title,
  eyebrow,
  actionLabel,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View>
          <Text style={styles.wordmark}>Deliver</Text>
          <Text style={styles.productLabel}>Курьер</Text>
        </View>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

type ActionButtonProps = PressableProps & {
  children: ReactNode;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({
  children,
  loading = false,
  disabled,
  variant = "primary",
  style,
  ...props
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "secondary" ? colors.accent : colors.accentForeground}
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "secondary" && styles.buttonTextSecondary,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function InlineNotice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "warning";
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        tone === "info" && styles.noticeInfo,
        tone === "warning" && styles.noticeWarning,
      ]}
    >
      <Text
        style={[
          styles.noticeText,
          tone === "info" && styles.noticeInfoText,
          tone === "warning" && styles.noticeWarningText,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

export function StatusPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "warning";
}) {
  return (
    <View
      style={[
        styles.pill,
        tone === "accent" && styles.pillAccent,
        tone === "warning" && styles.pillWarning,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "accent" && styles.pillTextAccent,
          tone === "warning" && styles.pillTextWarning,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  wordmark: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  productLabel: {
    color: colors.subdued,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  headerAction: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerActionText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    color: colors.subdued,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  button: {
    alignItems: "center",
    borderRadius: radii.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.78 },
  buttonText: {
    color: colors.accentForeground,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonTextSecondary: { color: colors.accent },
  notice: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#E9B8B2",
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  noticeInfo: {
    backgroundColor: colors.accentSoft,
    borderColor: "#B5D7CE",
  },
  noticeWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: "#E8C78D",
  },
  noticeText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  noticeInfoText: { color: colors.accent },
  noticeWarningText: { color: colors.warning },
  loadingState: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 260,
    padding: spacing.lg,
  },
  loadingLabel: { color: colors.subdued, fontSize: 15 },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  pillAccent: { backgroundColor: colors.accentSoft },
  pillWarning: { backgroundColor: colors.warningSoft },
  pillText: { color: colors.subdued, fontSize: 12, fontWeight: "700" },
  pillTextAccent: { color: colors.accent },
  pillTextWarning: { color: colors.warning },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minWidth: 140,
    padding: spacing.md,
  },
  statLabel: { color: colors.subdued, fontSize: 12, fontWeight: "600" },
  statValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
});
