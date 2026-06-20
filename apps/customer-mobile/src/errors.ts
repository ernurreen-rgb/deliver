import { ApiClientError } from "./api/client";

const reasonMessages: Record<string, string> = {
  invalid_phone: "Введите номер Казахстана в формате +7XXXXXXXXXX.",
  phone_not_allowed: "Этот номер не включён в закрытый пилот.",
  otp_provider_unavailable: "Вход по коду сейчас недоступен.",
  too_many_requests: "Слишком много запросов кода. Попробуйте позже.",
  too_many_otp_attempts: "Слишком много проверок кода. Попробуйте позже.",
  expired_code: "Код истёк. Запросите новый код.",
  bad_code: "Неверный код. Проверьте и попробуйте снова.",
  too_many_attempts: "Слишком много неверных попыток. Запросите новый код.",
  cart_changed: "Меню изменилось. Вернитесь в ресторан и обновите корзину.",
  minimum_order: "Сумма корзины меньше минимального заказа.",
  outside_radius: "Адрес находится вне зоны доставки ресторана.",
  restaurant_unavailable: "Ресторан сейчас не принимает заказы.",
  checkout_request_conflict: "Эта попытка заказа уже была изменена. Повторите оформление.",
};

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return (
      (error.reason ? reasonMessages[error.reason] : undefined) ?? error.message
    );
  }

  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}
