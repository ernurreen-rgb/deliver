import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "deliver.courier.session-token";

export function readSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export function saveSessionToken(token: string) {
  return SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function clearSessionToken() {
  return SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
