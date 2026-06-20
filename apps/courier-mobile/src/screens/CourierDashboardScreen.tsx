import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  CourierAssignedDelivery,
  CourierDashboardResponse,
  CourierOfferSummary,
} from "@deliver/contracts/courier";
import { formatKzt } from "@deliver/domain/money";
import { courierApi } from "../api/client";
import {
  ActionButton,
  AppHeader,
  InlineNotice,
  StatCard,
  StatusPill,
} from "../components/ui";
import {
  formatOfferTimeLeft,
  getCourierStatusLabel,
  getDeliveryAction,
  getOrderStatusLabel,
  getTransportLabel,
} from "../dashboard/model";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

function formatMoney(value: number | null) {
  return value === null ? "—" : formatKzt(value);
}

function OfferCard({
  offer,
  busyAction,
  onAction,
}: {
  offer: CourierOfferSummary;
  busyAction: string | null;
  onAction: (offerId: string, action: "accept" | "reject") => Promise<void>;
}) {
  const isBusy = busyAction === `offer:${offer.id}`;

  return (
    <View style={styles.offerCard} testID={`courier-offer-${offer.id}`}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.orderNumber}>{offer.orderNumber}</Text>
          <StatusPill tone="accent">
            Ответить за {formatOfferTimeLeft(offer.expiresAt)}
          </StatusPill>
        </View>
        <Text style={styles.total}>{formatMoney(offer.customerTotal)}</Text>
      </View>

      <View style={styles.addressBlock}>
        <Text style={styles.addressLabel}>Забрать</Text>
        <Text style={styles.addressTitle}>{offer.restaurantName}</Text>
        <Text style={styles.addressText}>{offer.restaurantAddress}</Text>
      </View>
      <View style={styles.addressBlock}>
        <Text style={styles.addressLabel}>Доставить</Text>
        <Text style={styles.addressTitle}>
          {offer.customerName} · {offer.customerPhone}
        </Text>
        <Text style={styles.addressText}>{offer.deliveryAddress}</Text>
      </View>

      <View style={styles.offerMetaRow}>
        <Text style={styles.metaText}>{offer.itemsCount} поз.</Text>
        <Text style={styles.metaText}>
          Доставка: {formatMoney(offer.deliveryFee)}
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          accessibilityLabel={`Принять ${offer.orderNumber}`}
          disabled={Boolean(busyAction)}
          loading={isBusy}
          onPress={() => void onAction(offer.id, "accept")}
          style={styles.flexButton}
          testID={`courier-accept-offer-${offer.id}`}
        >
          Принять
        </ActionButton>
        <ActionButton
          accessibilityLabel={`Отказаться от ${offer.orderNumber}`}
          disabled={Boolean(busyAction)}
          onPress={() => void onAction(offer.id, "reject")}
          style={styles.flexButton}
          testID={`courier-reject-offer-${offer.id}`}
          variant="secondary"
        >
          Отказаться
        </ActionButton>
      </View>
    </View>
  );
}

function DeliveryCard({
  delivery,
  busyAction,
  onAction,
}: {
  delivery: CourierAssignedDelivery;
  busyAction: string | null;
  onAction: (
    delivery: CourierAssignedDelivery,
    action: "pickup" | "start" | "complete" | "release",
    input?: { cashConfirmed?: boolean; reason?: string },
  ) => Promise<void>;
}) {
  const nextAction = getDeliveryAction(delivery);
  const isBusy = busyAction === `delivery:${delivery.id}`;
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");

  return (
    <View style={styles.deliveryCard} testID={`courier-delivery-${delivery.id}`}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.orderNumber}>{delivery.orderNumber}</Text>
          <StatusPill
            tone={delivery.status === "delivering" ? "accent" : "default"}
          >
            {getOrderStatusLabel(delivery.orderStatus)}
          </StatusPill>
        </View>
        <Text style={styles.total}>{formatMoney(delivery.customerTotal)}</Text>
      </View>

      <View style={styles.routeGrid}>
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Забрать</Text>
          <Text style={styles.addressTitle}>{delivery.restaurantName}</Text>
          <Text style={styles.addressText}>{delivery.restaurantAddress}</Text>
        </View>
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Доставить</Text>
          <Text style={styles.addressTitle}>
            {delivery.customerName} · {delivery.customerPhone}
          </Text>
          <Text style={styles.addressText}>{delivery.deliveryAddress}</Text>
        </View>
      </View>

      <InlineNotice tone={nextAction.action ? "info" : "warning"}>
        {nextAction.detail}
      </InlineNotice>

      {nextAction.action === "complete" ? (
        <View style={styles.cashRow}>
          <View style={styles.flex}>
            <Text style={styles.cashTitle}>Наличные получены</Text>
            <Text style={styles.cashText}>
              Подтвердите оплату перед завершением доставки.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Наличные получены"
            onValueChange={setCashConfirmed}
            thumbColor={colors.surface}
            trackColor={{ false: colors.border, true: colors.accent }}
            value={cashConfirmed}
          />
        </View>
      ) : null}

      {nextAction.action ? (
        <ActionButton
          accessibilityLabel={nextAction.label}
          disabled={Boolean(busyAction) || (nextAction.action === "complete" && !cashConfirmed)}
          loading={isBusy}
          onPress={() =>
            void onAction(delivery, nextAction.action!, {
              cashConfirmed,
            })
          }
          testID={`courier-delivery-action-${delivery.id}`}
        >
          {nextAction.label}
        </ActionButton>
      ) : null}

      {delivery.status === "assigned" ? (
        showRelease ? (
          <View style={styles.releaseBlock}>
            <Text style={styles.inputLabel}>Причина отказа</Text>
            <TextInput
              accessibilityLabel="Причина отказа от доставки"
              maxLength={240}
              multiline
              onChangeText={setReleaseReason}
              placeholder="Например: сломался велосипед"
              placeholderTextColor={colors.subdued}
              style={styles.reasonInput}
              testID={`courier-release-reason-${delivery.id}`}
              value={releaseReason}
            />
            <View style={styles.buttonRow}>
              <ActionButton
                accessibilityLabel="Передать заказ другому курьеру"
                disabled={!releaseReason.trim() || Boolean(busyAction)}
                loading={isBusy}
                onPress={() =>
                  void onAction(delivery, "release", { reason: releaseReason })
                }
                style={styles.flexButton}
                testID={`courier-confirm-release-${delivery.id}`}
                variant="danger"
              >
                Передать заказ
              </ActionButton>
              <ActionButton
                accessibilityLabel="Отменить отказ"
                disabled={Boolean(busyAction)}
                onPress={() => setShowRelease(false)}
                style={styles.flexButton}
                variant="secondary"
              >
                Отмена
              </ActionButton>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Не могу выполнить доставку"
            onPress={() => setShowRelease(true)}
            style={styles.releaseLink}
            testID={`courier-release-delivery-${delivery.id}`}
          >
            <Text style={styles.releaseLinkText}>Не могу выполнить доставку</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

export function CourierDashboardScreen({
  token,
  initialDashboard,
  onDashboard,
  onLogout,
}: {
  token: string;
  initialDashboard: CourierDashboardResponse;
  onDashboard: (dashboard: CourierDashboardResponse) => void;
  onLogout: () => Promise<void>;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateDashboard = useCallback(
    (next: CourierDashboardResponse) => {
      setDashboard(next);
      onDashboard(next);
    },
    [onDashboard],
  );

  const refresh = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setIsRefreshing(true);
      try {
        updateDashboard(await courierApi.getDashboard(token));
        setError(null);
      } catch (refreshError) {
        setError(getErrorMessage(refreshError));
      } finally {
        if (showSpinner) setIsRefreshing(false);
      }
    },
    [token, updateDashboard],
  );

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function changeAvailability() {
    setBusyAction("availability");
    setError(null);
    try {
      const result = await courierApi.setAvailability(
        token,
        dashboard.courier.status === "inactive",
      );
      updateDashboard(result.dashboard);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function actOnOffer(offerId: string, action: "accept" | "reject") {
    setBusyAction(`offer:${offerId}`);
    setError(null);
    try {
      const result = await courierApi.actOnOffer(token, offerId, action);
      updateDashboard(result.dashboard);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function actOnDelivery(
    delivery: CourierAssignedDelivery,
    action: "pickup" | "start" | "complete" | "release",
    input?: { cashConfirmed?: boolean; reason?: string },
  ) {
    setBusyAction(`delivery:${delivery.id}`);
    setError(null);
    try {
      const request =
        action === "complete"
          ? { action, cashCollectedConfirmed: input?.cashConfirmed === true }
          : action === "release"
            ? { action, reason: input?.reason?.trim() ?? "" }
            : { action };
      const result = await courierApi.actOnDelivery(token, delivery.id, request);
      updateDashboard(result.dashboard);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  const canToggleAvailability =
    dashboard.courier.status === "inactive" ||
    dashboard.courier.status === "available";

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
      testID="courier-dashboard"
    >
      <AppHeader
        actionLabel="Выйти"
        eyebrow={`${dashboard.courier.fullName} · ${dashboard.courier.phone}`}
        onAction={() => void onLogout()}
        title="Смена курьера"
      />

      {error ? (
        <View style={styles.horizontal}>
          <InlineNotice>{error}</InlineNotice>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard
          label="Статус"
          value={getCourierStatusLabel(dashboard.courier.status)}
        />
        <StatCard
          label="Баланс"
          value={formatKzt(dashboard.courier.balance)}
        />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.sectionEyebrow}>Линия</Text>
            <Text style={styles.sectionTitle}>
              {getCourierStatusLabel(dashboard.courier.availabilityStatus)}
            </Text>
            <Text style={styles.sectionDescription}>
              {getTransportLabel(dashboard.courier.transportType)} · обновлено{" "}
              {new Date(dashboard.refreshedAt).toLocaleTimeString("ru-KZ", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <StatusPill
            tone={dashboard.courier.status === "available" ? "accent" : "default"}
          >
            {dashboard.courier.hasLocation ? "Геопозиция есть" : "Нет геопозиции"}
          </StatusPill>
        </View>
        {canToggleAvailability ? (
          <ActionButton
            accessibilityLabel={
              dashboard.courier.status === "inactive"
                ? "Выйти на линию"
                : "Уйти с линии"
            }
            disabled={
              Boolean(busyAction) ||
              (dashboard.courier.status === "inactive" &&
                !dashboard.courier.hasLocation)
            }
            loading={busyAction === "availability"}
            onPress={() => void changeAvailability()}
            testID="courier-availability-toggle"
            variant={
              dashboard.courier.status === "inactive" ? "primary" : "secondary"
            }
          >
            {dashboard.courier.status === "inactive"
              ? "Выйти на линию"
              : "Уйти с линии"}
          </ActionButton>
        ) : (
          <InlineNotice tone="info">
            Во время активной доставки статус линии меняется автоматически.
          </InlineNotice>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Текущий маршрут</Text>
          <Text style={styles.sectionDescription}>
            Активных доставок: {dashboard.stats.assignedDeliveries}
          </Text>
        </View>
      </View>
      {dashboard.deliveries.length > 0 ? (
        dashboard.deliveries.map((delivery) => (
          <DeliveryCard
            busyAction={busyAction}
            delivery={delivery}
            key={delivery.id}
            onAction={actOnDelivery}
          />
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Активных доставок нет</Text>
          <Text style={styles.emptyText}>
            Выйдите на линию и дождитесь нового предложения.
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Новые предложения</Text>
          <Text style={styles.sectionDescription}>
            Доступно: {dashboard.stats.pendingOffers}
          </Text>
        </View>
      </View>
      {dashboard.offers.length > 0 ? (
        dashboard.offers.map((offer) => (
          <OfferCard
            busyAction={busyAction}
            key={offer.id}
            offer={offer}
            onAction={actOnOffer}
          />
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Предложений пока нет</Text>
          <Text style={styles.emptyText}>
            Экран обновляется автоматически каждые 10 секунд.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  horizontal: { paddingHorizontal: spacing.md },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionEyebrow: {
    color: colors.subdued,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionTitle: { color: colors.foreground, fontSize: 20, fontWeight: "800" },
  sectionDescription: {
    color: colors.subdued,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  rowBetween: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  flex: { flex: 1 },
  orderNumber: { color: colors.foreground, fontSize: 19, fontWeight: "800" },
  total: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  offerCard: {
    backgroundColor: colors.surface,
    borderColor: "#B5D7CE",
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  deliveryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  routeGrid: { gap: spacing.sm },
  addressBlock: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  addressLabel: {
    color: colors.subdued,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  addressTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  addressText: { color: colors.subdued, fontSize: 14, lineHeight: 20, marginTop: 3 },
  offerMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: { color: colors.subdued, fontSize: 13 },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  flexButton: { flex: 1 },
  cashRow: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  cashTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  cashText: { color: colors.subdued, fontSize: 12, lineHeight: 18, marginTop: 3 },
  releaseBlock: { gap: spacing.sm },
  inputLabel: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
  reasonInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.foreground,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  releaseLink: { alignItems: "center", padding: spacing.sm },
  releaseLinkText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
  },
  emptyTitle: { color: colors.foreground, fontSize: 17, fontWeight: "700" },
  emptyText: {
    color: colors.subdued,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
