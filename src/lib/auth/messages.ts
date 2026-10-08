export function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Não foi possível concluir a operação. Tente novamente.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (message.includes("password") && message.includes("characters")) {
    return "A senha não atende aos requisitos mínimos de segurança.";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Não foi possível conectar ao serviço. Verifique sua conexão.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}
