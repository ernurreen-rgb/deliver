import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AuthUser } from "@deliver/contracts/auth";
import type { RestaurantSummary } from "@deliver/contracts/catalog";
import { formatKzt } from "@deliver/domain/money";
import { customerApi } from "../api/client";
import { resolveApiAssetUrl } from "../api/config";
import type { CustomerCart } from "../cart/model";
import { getCartCount, getCartSubtotal } from "../cart/model";
import {
  ActionButton,
  AppHeader,
  EmptyState,
  InlineNotice,
  LoadingState,
} from "../components/ui";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

export function RestaurantListScreen({
  user,
  cart,
  onRestaurant,
  onCart,
  onLogout,
}: {
  user: AuthUser;
  cart: CustomerCart;
  onRestaurant: (restaurant: RestaurantSummary) => void;
  onCart: () => void;
  onLogout: () => void;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cartCount = getCartCount(cart);

  const loadRestaurants = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    setError(null);
    try {
      setRestaurants(await customerApi.getRestaurants());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void customerApi
      .getRestaurants()
      .then((items) => {
        if (active) setRestaurants(items);
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError));
      });

    return () => {
      active = false;
    };
  }, []);

  if (!restaurants && !error) return <LoadingState label="Загружаем рестораны…" />;

  return (
    <View style={styles.root}>
      <FlatList
        contentContainerStyle={[
          styles.content,
          cartCount > 0 && styles.contentWithCart,
        ]}
        data={restaurants ?? []}
        keyExtractor={(restaurant) => restaurant.id}
        ListHeaderComponent={
          <>
            <AppHeader
              actionLabel="Выйти"
              eyebrow={`Алматы · ${user.phone}`}
              onAction={onLogout}
              title="Рестораны рядом"
            />
            <Text style={styles.intro}>
              Выберите ресторан, добавьте блюда и оплатите заказ наличными курьеру.
            </Text>
            {error ? (
              <View style={styles.noticeWrap}>
                <InlineNotice>{error}</InlineNotice>
                <ActionButton
                  onPress={() => void loadRestaurants()}
                  variant="secondary"
                >
                  Повторить
                </ActionButton>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          error ? null : (
            <EmptyState
              description="Обновите список через несколько минут."
              title="Рестораны пока недоступны"
            />
          )
        }
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={() => void loadRestaurants(true)}
            refreshing={isRefreshing}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item: restaurant }) => {
          const imageUrl = resolveApiAssetUrl(restaurant.coverImageUrl);

          return (
            <Pressable
              accessibilityLabel={`Открыть ресторан ${restaurant.name}`}
              accessibilityRole="button"
              onPress={() => onRestaurant(restaurant)}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              testID={`restaurant-${restaurant.slug}`}
            >
              {imageUrl ? (
                <Image
                  accessibilityLabel={`${restaurant.name}: блюда ресторана`}
                  alt={`${restaurant.name}: блюда ресторана`}
                  source={{ uri: imageUrl }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Text style={styles.coverFallbackText}>{restaurant.name}</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{restaurant.name}</Text>
                  <Text style={styles.openPill}>
                    {restaurant.isOpen ? "Открыт" : "Закрыт"}
                  </Text>
                </View>
                {restaurant.description ? (
                  <Text numberOfLines={2} style={styles.description}>
                    {restaurant.description}
                  </Text>
                ) : null}
                <Text style={styles.minimum}>
                  Минимальный заказ {formatKzt(restaurant.minimumOrder)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      {cartCount > 0 ? (
        <View style={styles.cartBar}>
          <ActionButton
            accessibilityLabel={`Открыть корзину, ${cartCount} позиций`}
            onPress={onCart}
            testID="open-cart-button"
          >
            Корзина · {cartCount} · {formatKzt(getCartSubtotal(cart))}
          </ActionButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing.lg },
  contentWithCart: { paddingBottom: 104 },
  intro: {
    color: colors.subdued,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  noticeWrap: { gap: spacing.sm, padding: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
  cardPressed: { opacity: 0.78 },
  cover: { aspectRatio: 16 / 8, width: "100%" },
  coverFallback: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
  },
  coverFallbackText: { color: colors.subdued, fontWeight: "600" },
  cardBody: { gap: spacing.sm, padding: spacing.md },
  cardTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  cardTitle: {
    color: colors.foreground,
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
  },
  openPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  description: { color: colors.subdued, fontSize: 14, lineHeight: 20 },
  minimum: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  cartBar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: spacing.md,
    position: "absolute",
    right: 0,
  },
});
