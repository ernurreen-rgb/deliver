import { useEffect, useMemo, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MenuItem } from "@deliver/contracts/catalog";
import type {
  CartQuote,
  DeliveryAddressInput,
  OrderStatusResponse,
} from "@deliver/contracts/orders";
import { formatKzt } from "@deliver/domain/money";
import { customerApi } from "../api/client";
import type { CustomerCart } from "../cart/model";
import { toCartItems } from "../cart/model";
import {
  ActionButton,
  AppHeader,
  EmptyState,
  InlineNotice,
} from "../components/ui";
import { getErrorMessage } from "../errors";
import { colors, radii, spacing } from "../theme";

export function CheckoutScreen({
  token,
  cart,
  onBack,
  onQuantity,
  onOrderCreated,
}: {
  token: string;
  cart: CustomerCart;
  onBack: () => void;
  onQuantity: (item: MenuItem, quantity: number) => void;
  onOrderCreated: (order: OrderStatusResponse) => void;
}) {
  const [addressLine, setAddressLine] = useState("проспект Абая, 10");
  const [apartment, setApartment] = useState("");
  const [entrance, setEntrance] = useState("");
  const [floor, setFloor] = useState("");
  const [comment, setComment] = useState("");
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutKey = useRef<string | null>(null);
  const restaurant = cart.restaurant;

  const deliveryAddress = useMemo<DeliveryAddressInput>(
    () => ({
      label: "Дом",
      addressLine,
      apartment: apartment.trim() || undefined,
      entrance: entrance.trim() || undefined,
      floor: floor.trim() || undefined,
      comment: comment.trim() || undefined,
      latitude: 43.238949,
      longitude: 76.889709,
    }),
    [addressLine, apartment, comment, entrance, floor],
  );
  const cartPayload = useMemo(
    () =>
      restaurant
        ? {
            restaurantId: restaurant.id,
            items: toCartItems(cart),
            deliveryAddress,
          }
        : null,
    [cart, deliveryAddress, restaurant],
  );
  const payloadSignature = JSON.stringify(cartPayload);

  useEffect(() => {
    checkoutKey.current = null;
    if (!cartPayload || cartPayload.items.length === 0) {
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setIsQuoting(true);
      setError(null);
      void customerApi
        .quoteCart(token, cartPayload)
        .then((nextQuote) => {
          if (active) setQuote(nextQuote);
        })
        .catch((quoteError) => {
          if (active) {
            setQuote(null);
            setError(getErrorMessage(quoteError));
          }
        })
        .finally(() => {
          if (active) setIsQuoting(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cartPayload, payloadSignature, token]);

  async function submitOrder() {
    if (!cartPayload || !quote) return;

    setIsSubmitting(true);
    setError(null);
    const idempotencyKey = checkoutKey.current ?? Crypto.randomUUID();
    checkoutKey.current = idempotencyKey;

    try {
      const order = await customerApi.createCashOrder(token, {
        ...cartPayload,
        idempotencyKey,
        customerComment: comment.trim() || undefined,
      });
      onOrderCreated(order);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!restaurant || cart.lines.length === 0) {
    return (
      <View style={styles.root}>
        <AppHeader onBack={onBack} title="Корзина" />
        <EmptyState
          action={
            <ActionButton onPress={onBack} variant="secondary">
              К ресторанам
            </ActionButton>
          }
          description="Добавьте блюда из меню ресторана."
          title="Корзина пуста"
        />
      </View>
    );
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
        <AppHeader
          eyebrow={restaurant.name}
          onBack={onBack}
          title="Корзина и адрес"
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ваш заказ</Text>
          {cart.lines.map((line) => (
            <View key={line.item.id} style={styles.line}>
              <View style={styles.lineText}>
                <Text style={styles.lineName}>{line.item.name}</Text>
                <Text style={styles.linePrice}>
                  {formatKzt(line.item.price * line.quantity)}
                </Text>
              </View>
              <View style={styles.quantityControl}>
                <Pressable
                  accessibilityLabel={`Уменьшить ${line.item.name}`}
                  accessibilityRole="button"
                  onPress={() => onQuantity(line.item, line.quantity - 1)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </Pressable>
                <Text style={styles.quantity}>{line.quantity}</Text>
                <Pressable
                  accessibilityLabel={`Увеличить ${line.item.name}`}
                  accessibilityRole="button"
                  onPress={() => onQuantity(line.item, line.quantity + 1)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Адрес доставки</Text>
          <Text style={styles.pilotNote}>
            Для локального MVP используется тестовая точка на проспекте Абая.
          </Text>
          <Field label="Адрес" value={addressLine} onChangeText={setAddressLine} testID="address-input" />
          <View style={styles.fieldRow}>
            <Field label="Квартира" value={apartment} onChangeText={setApartment} />
            <Field label="Подъезд" value={entrance} onChangeText={setEntrance} />
            <Field label="Этаж" value={floor} onChangeText={setFloor} />
          </View>
          <Field
            label="Комментарий"
            multiline
            onChangeText={setComment}
            value={comment}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Оплата</Text>
          <View style={styles.cashOption}>
            <View>
              <Text style={styles.cashTitle}>Наличными курьеру</Text>
              <Text style={styles.cashDescription}>Онлайн-оплата в MVP не используется.</Text>
            </View>
            <Text style={styles.selected}>Выбрано</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Итого</Text>
          {isQuoting ? (
            <Text style={styles.pilotNote}>Пересчитываем доставку…</Text>
          ) : quote ? (
            <View style={styles.totals}>
              <TotalRow label="Блюда" value={quote.itemsSubtotal} />
              <TotalRow label="Доставка" value={quote.deliveryFee} />
              <TotalRow label="Сервисный сбор" value={quote.serviceFee} />
              <TotalRow emphasis label="К оплате" value={quote.total} />
            </View>
          ) : null}
          {error ? <InlineNotice>{error}</InlineNotice> : null}
          <ActionButton
            accessibilityLabel="Оформить заказ наличными"
            disabled={!quote || isQuoting}
            loading={isSubmitting}
            onPress={() => void submitOrder()}
            testID="create-cash-order-button"
          >
            Оформить cash-заказ
          </ActionButton>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subdued}
        style={[styles.input, props.multiline && styles.inputMultiline]}
        {...props}
      />
    </View>
  );
}

function TotalRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, emphasis && styles.totalEmphasis]}>{label}</Text>
      <Text style={[styles.totalValue, emphasis && styles.totalEmphasis]}>
        {formatKzt(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: { color: colors.foreground, fontSize: 19, fontWeight: "800" },
  line: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  lineText: { flex: 1 },
  lineName: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  linePrice: { color: colors.subdued, fontSize: 13, marginTop: 3 },
  quantityControl: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    flexDirection: "row",
  },
  quantityButton: { paddingHorizontal: 12, paddingVertical: 8 },
  quantityButtonText: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  quantity: { color: colors.accent, minWidth: 22, textAlign: "center", fontWeight: "800" },
  pilotNote: { color: colors.subdued, fontSize: 13, lineHeight: 19 },
  field: { flex: 1, gap: spacing.xs },
  fieldRow: { flexDirection: "row", gap: spacing.sm },
  fieldLabel: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },
  cashOption: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: "#B5D7CE",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  cashTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  cashDescription: { color: colors.subdued, fontSize: 12, marginTop: 3 },
  selected: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  totals: { gap: spacing.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.subdued, fontSize: 14 },
  totalValue: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  totalEmphasis: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
});
