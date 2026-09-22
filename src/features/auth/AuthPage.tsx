import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { z } from 'zod';

import { useOnlineStatus } from '../connectivity/useOnlineStatus';
import { useAuth } from './useAuth';

const credentialsSchema = z.object({
  email: z.email('Introduce un correo válido.'),
});

type Credentials = z.infer<typeof credentialsSchema>;

type AuthPageProps = {
  mode: 'login' | 'register';
};

function authErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;

  if (code === 'user_already_exists' || code === 'email_exists') {
    return 'Ya existe una cuenta con ese correo.';
  }

  return 'No se ha podido enviar el enlace. Inténtalo de nuevo.';
}

export function AuthPage({ mode }: AuthPageProps) {
  const { user, isLoading, requestEmailLink, signInWithGoogle } = useAuth();
  const isOnline = useOnlineStatus();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const isLogin = mode === 'login';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '' },
  });

  if (!isLoading && user) {
    return <Navigate to="/cuenta" replace />;
  }

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(undefined);
    setNotice(undefined);

    if (!isOnline) {
      setFormError('Recupera la conexión para solicitar un enlace de acceso.');
      return;
    }

    try {
      await requestEmailLink(email, !isLogin);
      setNotice(
        isLogin
          ? 'Te hemos enviado un enlace para iniciar sesión. Revisa tu correo.'
          : 'Te hemos enviado un enlace para crear la cuenta. Revisa tu correo.',
      );
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  async function handleGoogleSignIn() {
    setFormError(undefined);
    if (!isOnline) {
      setFormError('Recupera la conexión para continuar con Google.');
      return;
    }
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-md rounded-3xl border border-stone-800 bg-stone-900 p-7 shadow-2xl shadow-black/20">
        <Link className="text-sm text-lime-400 hover:text-lime-300" to="/">
          ← Volver al inicio
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">
          {isLogin ? 'Iniciar sesión' : 'Crear una cuenta'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          {isLogin
            ? 'Recibe un enlace seguro para consultar y gestionar tus propuestas.'
            : 'Crea tu cuenta mediante un enlace seguro enviado a tu correo.'}
        </p>

        <form className="mt-8 space-y-5" noValidate onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-stone-200" htmlFor="email">
              Correo electrónico
            </label>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-stone-100 outline-none transition focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
              id="email"
              type="email"
              {...register('email')}
            />
            {errors.email && <p className="mt-2 text-sm text-red-400">{errors.email.message}</p>}
          </div>

          {formError && (
            <p
              className="rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {formError}
            </p>
          )}
          {notice && (
            <p
              className="rounded-xl border border-lime-900 bg-lime-950/50 px-4 py-3 text-sm text-lime-300"
              role="status"
            >
              {notice}
            </p>
          )}

          <button
            className="w-full rounded-xl bg-lime-400 px-4 py-3 font-semibold text-stone-950 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || isLoading || !isOnline}
            type="submit"
          >
            {isSubmitting ? 'Enviando…' : 'Enviar enlace por correo'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-stone-500">
          <span className="h-px flex-1 bg-stone-800" />
          o
          <span className="h-px flex-1 bg-stone-800" />
        </div>

        <button
          className="w-full rounded-xl border border-stone-700 px-4 py-3 font-semibold text-stone-100 transition hover:border-stone-500 disabled:opacity-60"
          disabled={isSubmitting || isLoading || !isOnline}
          onClick={() => void handleGoogleSignIn()}
          type="button"
        >
          Continuar con Google
        </button>

        <p className="mt-6 text-center text-sm text-stone-400">
          {isLogin ? '¿Todavía no tienes cuenta?' : '¿Ya tienes una cuenta?'}{' '}
          <Link
            className="font-medium text-lime-400 hover:text-lime-300"
            to={isLogin ? '/registro' : '/acceso'}
          >
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </Link>
        </p>
      </section>
    </main>
  );
}
