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
  onBack,
  actionLabel,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={onBack}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionText}>Назад</Text>
          </Pressable>
        ) : (
          <Text style={styles.wordmark}>Deliver</Text>
        )}
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
  tone?: "error" | "info";
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, tone === "info" && styles.noticeInfo]}
    >
      <Text style={[styles.noticeText, tone === "info" && styles.noticeInfoText]}>
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

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36,
  },
  wordmark: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
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
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonText: {
    color: colors.accentForeground,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonTextSecondary: {
    color: colors.accent,
  },
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
  noticeText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeInfoText: {
    color: colors.accent,
  },
  loadingState: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 260,
    padding: spacing.lg,
  },
  loadingLabel: {
    color: colors.subdued,
    fontSize: 15,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    margin: spacing.md,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDescription: {
    color: colors.subdued,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  emptyAction: {
    marginTop: spacing.md,
    width: "100%",
  },
});
