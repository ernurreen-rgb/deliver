import { useEffect, useState } from "react";
import { Alert, BackHandler, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { AuthUser } from "@deliver/contracts/auth";
import type { MenuItem, RestaurantSummary } from "@deliver/contracts/catalog";
import type { OrderStatusResponse } from "@deliver/contracts/orders";
import { customerApi } from "./api/client";
import {
  clearSessionToken,
  readSessionToken,
  saveSessionToken,
} from "./auth/session-store";
import {
  emptyCart,
  setCartItemQuantity,
  type CustomerCart,
} from "./cart/model";
import { LoadingState } from "./components/ui";
import { CheckoutScreen } from "./screens/CheckoutScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { MenuScreen } from "./screens/MenuScreen";
import { OrderStatusScreen } from "./screens/OrderStatusScreen";
import { RestaurantListScreen } from "./screens/RestaurantListScreen";
import { colors } from "./theme";

type AppRoute =
  | { name: "restaurants" }
  | { name: "menu"; restaurant: RestaurantSummary }
  | { name: "checkout" }
  | { name: "order"; order: OrderStatusResponse };

export function CustomerMobileApp() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cart, setCart] = useState<CustomerCart>(emptyCart);
  const [route, setRoute] = useState<AppRoute>({ name: "restaurants" });

  useEffect(() => {
    let active = true;

    void readSessionToken().then(async (storedToken) => {
      if (!storedToken) {
        if (active) setToken(null);
        return;
      }

      try {
        const session = await customerApi.getSession(storedToken);
        if (active) {
          setUser(session.user);
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.name === "restaurants") return false;

      if (route.name === "menu" || route.name === "order") {
        setRoute({ name: "restaurants" });
      } else if (cart.restaurant) {
        setRoute({ name: "menu", restaurant: cart.restaurant });
      } else {
        setRoute({ name: "restaurants" });
      }
      return true;
    });

    return () => subscription.remove();
  }, [cart.restaurant, route.name]);

  async function authenticate(input: { token: string; user: AuthUser }) {
    await saveSessionToken(input.token);
    setToken(input.token);
    setUser(input.user);
    setRoute({ name: "restaurants" });
  }

  async function logout() {
    if (token) {
      try {
        await customerApi.logout(token);
      } catch {
        // Local token removal still prevents reuse by this client.
      }
    }
    await clearSessionToken();
    setToken(null);
    setUser(null);
    setCart(emptyCart);
    setRoute({ name: "restaurants" });
  }

  function updateMenuItem(
    restaurant: RestaurantSummary,
    item: MenuItem,
    quantity: number,
  ) {
    if (
      quantity > 0 &&
      cart.restaurant &&
      cart.restaurant.id !== restaurant.id &&
      cart.lines.length > 0
    ) {
      Alert.alert(
        "Заменить корзину?",
        "В одной корзине могут быть блюда только одного ресторана.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Заменить",
            style: "destructive",
            onPress: () =>
              setCart((current) =>
                setCartItemQuantity(current, restaurant, item, quantity),
              ),
          },
        ],
      );
      return;
    }

    setCart((current) =>
      setCartItemQuantity(current, restaurant, item, quantity),
    );
  }

  function showCreatedOrder(order: OrderStatusResponse) {
    setCart(emptyCart);
    setRoute({ name: "order", order });
  }

  let content;

  if (token === undefined) {
    content = <LoadingState label="Проверяем сессию…" />;
  } else if (!token || !user) {
    content = <LoginScreen onAuthenticated={authenticate} />;
  } else if (route.name === "menu") {
    content = (
      <MenuScreen
        cart={cart}
        onBack={() => setRoute({ name: "restaurants" })}
        onCart={() => setRoute({ name: "checkout" })}
        onQuantity={updateMenuItem}
        restaurant={route.restaurant}
      />
    );
  } else if (route.name === "checkout") {
    content = (
      <CheckoutScreen
        cart={cart}
        onBack={() =>
          setRoute(
            cart.restaurant
              ? { name: "menu", restaurant: cart.restaurant }
              : { name: "restaurants" },
          )
        }
        onOrderCreated={showCreatedOrder}
        onQuantity={(item, quantity) => {
          if (cart.restaurant) updateMenuItem(cart.restaurant, item, quantity);
        }}
        token={token}
      />
    );
  } else if (route.name === "order") {
    content = (
      <OrderStatusScreen
        initialOrder={route.order}
        onRestaurants={() => setRoute({ name: "restaurants" })}
        token={token}
      />
    );
  } else {
    content = (
      <RestaurantListScreen
        cart={cart}
        onCart={() => setRoute({ name: "checkout" })}
        onLogout={() => void logout()}
        onRestaurant={(restaurant) => setRoute({ name: "menu", restaurant })}
        user={user}
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
