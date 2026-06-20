import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { OrderStatus } from "@deliver/contracts/domain";
import type { OrderStatusResponse } from "@deliver/contracts/orders";
import { formatKzt } from "@deliver/domain/money";
import { customerApi } from "../api/client";
import { ActionButton, AppHeader, InlineNotice } from "../components/ui";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

const terminalStatuses = new Set<OrderStatus>(["delivered", "cancelled"]);

export function OrderStatusScreen({
  token,
  initialOrder,
  onRestaurants,
}: {
  token: string;
  initialOrder: OrderStatusResponse;
  onRestaurants: () => void;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      setOrder(await customerApi.getOrder(token, initialOrder.number));
      setError(null);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }, [initialOrder.number, token]);

  useEffect(() => {
    if (terminalStatuses.has(order.status)) return;

    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [order.status, refresh]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[colors.accent]}
          onRefresh={() => void refresh(true)}
          refreshing={isRefreshing}
          tintColor={colors.accent}
        />
      }
    >
      <AppHeader
        eyebrow={`Заказ ${order.number}`}
        onBack={onRestaurants}
        title="Статус заказа"
      />

      <View style={styles.heroCard} testID="order-status-card">
        <Text style={styles.statusLabel}>{order.statusLabel}</Text>
        <Text style={styles.restaurant}>{order.restaurantName}</Text>
        <Text style={styles.total}>{formatKzt(order.total)}</Text>
        <Text style={styles.hint}>
          Статус обновляется автоматически каждые 5 секунд. Потяните экран вниз,
          чтобы проверить сейчас.
        </Text>
      </View>

      {error ? (
        <View style={styles.horizontal}>
          <InlineNotice>{error}</InlineNotice>
        </View>
      ) : null}

      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>История</Text>
        {order.events.map((event, index) => (
          <View key={`${event.status}-${event.occurredAt}`} style={styles.eventRow}>
            <View style={styles.eventRail}>
              <View style={styles.eventDot} />
              {index < order.events.length - 1 ? <View style={styles.eventLine} /> : null}
            </View>
            <View style={styles.eventText}>
              <Text style={styles.eventLabel}>{event.label}</Text>
              <Text style={styles.eventTime}>
                {new Date(event.occurredAt).toLocaleString("ru-KZ", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.horizontal}>
        <ActionButton onPress={() => void refresh(true)} variant="secondary">
          Обновить статус
        </ActionButton>
        <ActionButton onPress={onRestaurants}>К ресторанам</ActionButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  horizontal: { gap: spacing.sm, paddingHorizontal: spacing.md },
  heroCard: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
  },
  statusLabel: { color: colors.accentForeground, fontSize: 26, fontWeight: "800" },
  restaurant: { color: "#D5EDE7", fontSize: 15 },
  total: { color: colors.accentForeground, fontSize: 20, fontWeight: "800" },
  hint: { color: "#D5EDE7", fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  timelineCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: { color: colors.foreground, fontSize: 19, fontWeight: "800", marginBottom: spacing.md },
  eventRow: { flexDirection: "row", minHeight: 58 },
  eventRail: { alignItems: "center", width: 24 },
  eventDot: { backgroundColor: colors.accent, borderRadius: 6, height: 12, marginTop: 4, width: 12 },
  eventLine: { backgroundColor: colors.border, flex: 1, marginVertical: 4, width: 2 },
  eventText: { flex: 1, paddingBottom: spacing.md, paddingLeft: spacing.sm },
  eventLabel: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  eventTime: { color: colors.subdued, fontSize: 12, marginTop: 3 },
});
