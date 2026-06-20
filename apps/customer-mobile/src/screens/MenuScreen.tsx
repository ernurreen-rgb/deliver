import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  MenuItem,
  RestaurantMenu,
  RestaurantSummary,
} from "@deliver/contracts/catalog";
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

export function MenuScreen({
  restaurant,
  cart,
  onBack,
  onCart,
  onQuantity,
}: {
  restaurant: RestaurantSummary;
  cart: CustomerCart;
  onBack: () => void;
  onCart: () => void;
  onQuantity: (restaurant: RestaurantSummary, item: MenuItem, quantity: number) => void;
}) {
  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quantities = useMemo(
    () => new Map(cart.lines.map((line) => [line.item.id, line.quantity])),
    [cart.lines],
  );
  const cartCount = getCartCount(cart);

  const loadMenu = useCallback(async () => {
    setError(null);
    try {
      setMenu(await customerApi.getMenu(restaurant.slug));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [restaurant.slug]);

  useEffect(() => {
    let active = true;

    void customerApi
      .getMenu(restaurant.slug)
      .then((nextMenu) => {
        if (active) setMenu(nextMenu);
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError));
      });

    return () => {
      active = false;
    };
  }, [restaurant.slug]);

  if (!menu && !error) return <LoadingState label="Загружаем меню…" />;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          cartCount > 0 && styles.contentWithCart,
        ]}
      >
        <AppHeader
          eyebrow={restaurant.description ?? "Меню ресторана"}
          onBack={onBack}
          title={restaurant.name}
        />

        {error ? (
          <View style={styles.noticeWrap}>
            <InlineNotice>{error}</InlineNotice>
            <ActionButton onPress={() => void loadMenu()} variant="secondary">
              Повторить
            </ActionButton>
          </View>
        ) : null}

        {menu?.categories.map((category) => (
          <View key={category.id} style={styles.category}>
            <Text accessibilityRole="header" style={styles.categoryTitle}>
              {category.name}
            </Text>
            {category.items.length === 0 ? (
              <EmptyState
                description="Попробуйте выбрать другую категорию."
                title="Блюд пока нет"
              />
            ) : (
              category.items.map((item) => {
                const quantity = quantities.get(item.id) ?? 0;
                const imageUrl = resolveApiAssetUrl(item.imageUrl);

                return (
                  <View key={item.id} style={styles.itemCard}>
                    {imageUrl ? (
                      <Image
                        accessibilityLabel={item.name}
                        alt={item.name}
                        source={{ uri: imageUrl }}
                        style={styles.itemImage}
                      />
                    ) : null}
                    <View style={styles.itemContent}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.itemDescription}>{item.description}</Text>
                      ) : null}
                      <View style={styles.itemBottomRow}>
                        <Text style={styles.itemPrice}>{formatKzt(item.price)}</Text>
                        {quantity === 0 ? (
                          <Pressable
                            accessibilityLabel={`Добавить ${item.name}`}
                            accessibilityRole="button"
                            disabled={!item.isAvailable}
                            onPress={() => onQuantity(restaurant, item, 1)}
                            style={({ pressed }) => [
                              styles.addButton,
                              pressed && styles.controlPressed,
                              !item.isAvailable && styles.disabled,
                            ]}
                            testID={`add-item-${item.id}`}
                          >
                            <Text style={styles.addButtonText}>
                              {item.isAvailable ? "Добавить" : "Недоступно"}
                            </Text>
                          </Pressable>
                        ) : (
                          <View style={styles.quantityControl}>
                            <Pressable
                              accessibilityLabel={`Уменьшить ${item.name}`}
                              accessibilityRole="button"
                              onPress={() => onQuantity(restaurant, item, quantity - 1)}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                pressed && styles.controlPressed,
                              ]}
                            >
                              <Text style={styles.quantityButtonText}>−</Text>
                            </Pressable>
                            <Text accessibilityLabel={`Количество ${quantity}`} style={styles.quantity}>
                              {quantity}
                            </Text>
                            <Pressable
                              accessibilityLabel={`Увеличить ${item.name}`}
                              accessibilityRole="button"
                              onPress={() => onQuantity(restaurant, item, quantity + 1)}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                pressed && styles.controlPressed,
                              ]}
                            >
                              <Text style={styles.quantityButtonText}>+</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ))}
      </ScrollView>

      {cartCount > 0 ? (
        <View style={styles.cartBar}>
          <ActionButton onPress={onCart} testID="open-cart-button">
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
  noticeWrap: { gap: spacing.sm, paddingHorizontal: spacing.md },
  category: { gap: spacing.sm, padding: spacing.md, paddingTop: spacing.sm },
  categoryTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "800",
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemImage: { aspectRatio: 16 / 8, width: "100%" },
  itemContent: { gap: spacing.sm, padding: spacing.md },
  itemName: { color: colors.foreground, fontSize: 18, fontWeight: "700" },
  itemDescription: { color: colors.subdued, fontSize: 14, lineHeight: 20 },
  itemBottomRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  itemPrice: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  addButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    minWidth: 104,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonText: { color: colors.accent, fontSize: 14, fontWeight: "700", textAlign: "center" },
  quantityControl: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    flexDirection: "row",
  },
  quantityButton: { paddingHorizontal: 14, paddingVertical: 8 },
  quantityButtonText: { color: colors.accent, fontSize: 20, fontWeight: "700" },
  quantity: { color: colors.accent, minWidth: 24, textAlign: "center", fontWeight: "800" },
  controlPressed: { opacity: 0.55 },
  disabled: { opacity: 0.45 },
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
