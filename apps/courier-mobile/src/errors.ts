import { ApiClientError } from "./api/client";

const reasonMessages: Record<string, string> = {
  active_delivery_exists: "Сначала завершите активную доставку.",
  bad_code: "Код неверный. Проверьте и попробуйте снова.",
  cash_confirmation_required: "Подтвердите получение наличных.",
  courier_location_required: "Для выхода на линию нужна геопозиция курьера.",
  courier_not_found: "Профиль курьера не найден.",
  courier_unavailable: "Курьер сейчас недоступен для этого действия.",
  delivery_not_found: "Доставка не найдена.",
  expired_code: "Код истёк. Запросите новый.",
  expired: "Предложение уже истекло.",
  financial_record_missing: "Не хватает финансовых данных заказа. Обратитесь к оператору.",
  invalid_courier_status: "Текущий статус курьера не позволяет это действие.",
  invalid_delivery_status: "Статус доставки уже изменился. Обновите экран.",
  offer_expired: "Предложение уже истекло.",
  offer_not_found: "Предложение не найдено.",
  offer_unavailable: "Предложение уже недоступно.",
  payment_amount_mismatch: "Сумма оплаты не совпадает с заказом. Обратитесь к оператору.",
  payment_record_missing: "Не найдена оплата заказа. Обратитесь к оператору.",
  phone_not_allowed: "Номер не включён в закрытый пилот.",
  reason_required: "Укажите причину отказа от доставки.",
  too_many_otp_attempts: "Слишком много попыток. Запросите новый код позже.",
  too_many_requests: "Слишком много запросов. Попробуйте позже.",
  unsupported_payment_method: "Этот способ оплаты нельзя закрыть в courier-mobile.",
};

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.reason && reasonMessages[error.reason]) {
      return reasonMessages[error.reason];
    }

    if (error.code === "forbidden") {
      return "Для входа нужен аккаунт курьера.";
    }

    if (error.code === "network_error") return error.message;
  }

  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}
