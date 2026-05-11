import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import {
  requestOtpAction,
  verifyOtpAction,
} from "@/domains/auth/actions";
import { DEV_OTP_CODE, isDevOtpEnabled } from "@/domains/auth/constants";

type LoginPageProps = {
  searchParams: Promise<{
    phone?: string;
    sent?: string;
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  otp_provider_unavailable: "Отправка кода пока доступна только в dev-режиме.",
  too_many_attempts: "Слишком много попыток. Запросите новый код.",
  user_unavailable: "Аккаунт недоступен. Обратитесь в поддержку.",
  invalid_phone: "Введите номер Казахстана в формате +7XXXXXXXXXX.",
  invalid_code: "Введите номер телефона и код.",
  expired_code: "Код истек. Запросите новый код.",
  bad_code: "Код неверный. Проверьте и попробуйте снова.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const phone = params.phone ?? "";
  const isSent = params.sent === "1";
  const devOtpEnabled = isDevOtpEnabled();
  const showDevCode = isSent && devOtpEnabled;
  const errorMessage = params.error ? errorMessages[params.error] : null;

  return (
    <SurfaceShell
      title="Вход по телефону"
      description="В разработке используется dev OTP без отправки SMS. Production-провайдера подключим перед запуском."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">1. Получить код</h2>
          <form action={requestOtpAction} className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Телефон</span>
              <input
                name="phone"
                type="tel"
                defaultValue={phone}
                placeholder="+77000000000"
                className="h-12 rounded-md border border-border bg-background px-3 text-base outline-none transition-colors focus:border-accent"
                required
              />
            </label>
            <button className="h-12 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground">
              Получить код
            </button>
          </form>

          {showDevCode ? (
            <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
              Dev-код для входа:{" "}
              <span className="font-mono font-semibold">{DEV_OTP_CODE}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">2. Подтвердить вход</h2>
          <form action={verifyOtpAction} className="mt-4 grid gap-3">
            <input name="phone" type="hidden" value={phone} />
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Код</span>
              <input
                name="code"
                inputMode="numeric"
                placeholder={devOtpEnabled ? DEV_OTP_CODE : "000000"}
                className="h-12 rounded-md border border-border bg-background px-3 text-base outline-none transition-colors focus:border-accent"
                required
              />
            </label>
            <button
              className="h-12 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!phone}
            >
              Войти
            </button>
          </form>

          {errorMessage ? (
            <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>

      <Link
        href="/"
        className="mt-6 inline-flex text-sm font-medium text-foreground/65 hover:text-accent"
      >
        Вернуться к ресторанам
      </Link>
    </SurfaceShell>
  );
}
