import type { AuthErrorKind } from '../../domain/AuthError';

export type AuthLanguage = 'pt-BR' | 'en-US';

export interface AuthCopy {
  /** The screen a signed-out person actually lands on: the brand, the promise,
   * a cut-out of the product, and only then the ways in. The provider labels
   * are short here because the buttons carry a glyph and sit in a row — the
   * long forms in `login` still apply on the email screen behind it. */
  entrance: {
    headline: string;
    google: string;
    apple: string;
    email: string;
    guest: string;
    /** Shown in place of the provider's own label while its sheet is open and
     * the account is being checked. The wait is the provider's, not the app's,
     * and it can run for several seconds on a slow network — long enough that
     * a screen with nothing moving on it reads as a screen that crashed. */
    waiting: string;
    /** The way back to this screen from the email form behind it. */
    back: string;
    /** Somebody arrived by tapping an invite link. The entrance shows what
     * they were invited to before asking for anything — proof before the ask.
     * `by` and `space` are filled from the link's own preview. */
    invited: {
      headline: (by: string, space: string) => string;
      lede: string;
      today: string;
      expired: string;
      expiredHint: string;
      otherAccount: string;
    };
    /** Split so the two link words can be tapped without parsing a sentence
     * for them. Rendered as `lead terms and privacy.` */
    legal: { lead: string; terms: string; and: string; privacy: string };
  };
  login: {
    title: string;
    subtitle: string;
    submit: string;
    forgotLink: string;
    signUpLink: string;
    divider: string;
    google: string;
    apple: string;
    anonymous: string;
  };
  anonymous: {
    title: string;
    subtitle: string;
    submit: string;
    notice: string;
    backToLoginLink: string;
    settingsNote: string;
  };
  signUp: {
    title: string;
    subtitle: string;
    submit: string;
    backToLoginLink: string;
  };
  forgot: {
    title: string;
    subtitle: string;
    submit: string;
    backToLoginLink: string;
    sent: (email: string) => string;
  };
  fields: {
    email: string;
    password: string;
    confirmPassword: string;
    name: string;
  };
  fieldErrors: {
    nameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: string;
    confirmPasswordMismatch: string;
  };
  errors: Record<AuthErrorKind, string>;
  retry: string;
  account: {
    label: string;
    signOut: string;
    /** Asked only of a guest account: it lives on this phone alone, so
     * leaving it is losing it, and one tap must not do that in silence. */
    signOutGuestTitle: string;
    signOutGuestBody: string;
    signOutGuestConfirm: string;
    /** The last line of the tab, and the only red one. */
    delete: string;
  };
  /** Closing the account for good: what it takes with it, what has to be
   * proven first, and the two words that end it. */
  deleteAccount: {
    title: string;
    body: string;
    /** What goes with the account, one line each. Written as facts, not as a
     * warning: the person already knows this is the destructive door. */
    losses: readonly string[];
    /** Only asked of an account that has a password of its own; Google and
     * Apple prove themselves with their own sheet. */
    passwordLabel: string;
    passwordHint: string;
    confirm: string;
    cancel: string;
    busy: string;
    /** Firebase will not erase an account on a session that has been open for
     * a while, so the sheet asks for the sign-in again before anything goes. */
    proofTitle: string;
    proofBody: string;
  };
  profile: {
    title: string;
    subtitle: string;
    edit: string;
    displayNameLabel: string;
    displayNamePlaceholder: string;
    handleLabel: string;
    handlePlaceholder: string;
    handleHint: string;
    changePhoto: string;
    removePhoto: string;
    photoAction: string;
    photoUploading: string;
    submit: string;
    saved: string;
    errors: {
      displayNameRequired: string;
      handleTooShort: string;
      handleTooLong: string;
      handleInvalidChars: string;
      handleTaken: string;
      refused: string;
      network: string;
      forbidden: string;
      photoStorageUnavailable: string;
      photoForbidden: string;
      photoNetwork: string;
    };
  };
}

const pt: AuthCopy = {
  entrance: {
    // The same promise the walk-through opens with: whoever skipped it still
    // reads what the app is before being asked for anything.
    headline: 'Um espaço para a vida que vocês dividem.',
    google: 'Continuar com Google',
    apple: 'Apple',
    email: 'E-mail',
    guest: 'Continuar só com nome',
    waiting: 'Conectando…',
    back: 'Voltar',
    invited: {
      headline: (by, space) => `${by} te chamou para o espaço ${space}.`,
      lede: 'Vocês dois vão ver o mesmo dia: o que cada um levou e o que já fechou.',
      today: 'O dia de vocês',
      expired: 'Este convite expirou.',
      expiredHint: 'Peça um link novo para quem te chamou.',
      otherAccount: 'Alguém',
    },
    legal: {
      lead: 'Ao continuar você aceita os',
      terms: 'Termos',
      and: 'e a',
      privacy: 'Privacidade',
    },
  },
  login: {
    title: 'Entrar',
    subtitle: 'Use o e-mail e a senha da sua conta.',
    submit: 'Entrar',
    forgotLink: 'Esqueci minha senha',
    signUpLink: 'Criar conta',
    divider: 'OU',
    // The wording Google's own brand guidelines list for pt-BR.
    google: 'Fazer login com o Google',
    apple: 'Entrar com Apple',
    anonymous: 'Continuar só com nome',
  },
  anonymous: {
    title: 'Continuar só com nome',
    subtitle: 'Sem e-mail, sem senha. Só o nome que aparece nos espaços.',
    submit: 'Entrar',
    notice:
      'Esta conta fica só neste aparelho. Trocar de celular ou desinstalar o app leva as ideias junto. Dá para vincular a um e-mail ou ao Google depois, sem perder nada.',
    backToLoginLink: 'Voltar para o login',
    settingsNote: 'Conta só neste aparelho',
  },
  signUp: {
    title: 'Criar conta',
    subtitle: 'Leva menos de um minuto.',
    submit: 'Criar conta',
    backToLoginLink: 'Já tenho conta',
  },
  forgot: {
    title: 'Recuperar senha',
    subtitle:
      'Informe o e-mail da conta e enviamos um link para redefinir a senha.',
    submit: 'Enviar e-mail de recuperação',
    backToLoginLink: 'Voltar para o login',
    sent: email => `E-mail de recuperação enviado para ${email}.`,
  },
  fields: {
    email: 'E-mail',
    password: 'Senha',
    confirmPassword: 'Confirmar senha',
    name: 'Nome',
  },
  fieldErrors: {
    nameRequired: 'Digite um nome.',
    emailRequired: 'Digite seu e-mail.',
    emailInvalid: 'E-mail inválido.',
    passwordRequired: 'Digite sua senha.',
    passwordTooShort: 'Senha precisa ter 6 caracteres ou mais.',
    confirmPasswordMismatch: 'As senhas não são iguais.',
  },
  errors: {
    'invalid-credential':
      'E-mail ou senha não conferem. Confira e tente de novo.',
    network: 'Sem conexão no momento.',
    'email-in-use':
      'Este e-mail já tem conta. Que tal entrar em vez de cadastrar?',
    'too-many-requests':
      'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
    'requires-recent-login':
      'Faz tempo desde a última entrada. Confirme quem você é para continuar.',
    // Never rendered: a cancelled sheet leaves the screen exactly as it was.
    cancelled: '',
    'play-services-unavailable':
      'O Google Play Services não está disponível neste aparelho. Dá para entrar com e-mail e senha.',
    // Names what is wrong rather than asking for another try: trying again
    // never fixes an install Google does not recognise.
    'provider-misconfigured':
      'Esta instalação do app não está autorizada para o login do Google (assinatura não registrada). Dá para entrar com e-mail e senha.',
    'provider-unavailable':
      'Esta forma de entrar está indisponível agora. Dá para entrar com e-mail e senha.',
    'account-exists-with-different-credential':
      'Este e-mail já entra por outro caminho. Use aquele para continuar.',
    unknown: 'Algo não funcionou.',
  },
  retry: 'Tentar de novo',
  account: {
    label: 'Conta',
    signOut: 'Sair',
    signOutGuestTitle: 'Sair da conta de convidado?',
    signOutGuestBody:
      'Ela existe só neste aparelho. Ao sair, suas tarefas e espaços somem daqui e não dá para entrar nela de novo. Para guardar tudo, vincule um e-mail ou o Google antes.',
    signOutGuestConfirm: 'Sair mesmo assim',
    delete: 'Excluir conta',
  },
  deleteAccount: {
    title: 'Excluir sua conta?',
    body: 'Isso não tem volta. Some agora e some para sempre:',
    losses: [
      'Seu perfil, seu nome de usuário e sua foto',
      'Suas tarefas e espaços, neste aparelho e na cópia guardada da conta',
      'Os espaços que você administra saem do ar para todo mundo',
      'Sua entrada nos espaços das outras pessoas',
    ],
    passwordLabel: 'Senha',
    passwordHint: 'Confirme a senha da conta para excluir.',
    confirm: 'Excluir conta',
    cancel: 'Cancelar',
    busy: 'Excluindo…',
    proofTitle: 'Confirme que é você',
    proofBody:
      'Faz tempo desde a última entrada. Entre de novo e a exclusão segue.',
  },
  profile: {
    title: 'Perfil',
    subtitle: 'É assim que as outras pessoas te reconhecem nos espaços.',
    edit: 'Editar perfil',
    displayNameLabel: 'Nome de exibição',
    displayNamePlaceholder: 'Como te chamam',
    handleLabel: 'Nome de usuário',
    handlePlaceholder: 'seu_nome',
    handleHint: '3–20 caracteres: letras minúsculas, números e _',
    changePhoto: 'Trocar foto',
    removePhoto: 'Remover foto',
    photoAction: 'Alterar foto de perfil',
    photoUploading: 'Enviando a foto',
    submit: 'Salvar',
    saved: 'Perfil atualizado',
    errors: {
      displayNameRequired: 'Escolha um nome de exibição.',
      handleTooShort: 'O nome de usuário precisa de 3 caracteres ou mais.',
      handleTooLong: 'O nome de usuário vai até 20 caracteres.',
      handleInvalidChars:
        'Use apenas letras minúsculas, números e _ no nome de usuário.',
      handleTaken:
        'Esse nome de usuário já está com outra pessoa. Tente outro.',
      refused:
        'O servidor recusou a alteração agora. Tente de novo em instantes.',
      network: 'Não deu para salvar agora. Tente de novo.',
      forbidden: 'Entre de novo na conta para salvar o perfil.',
      photoStorageUnavailable:
        'Não foi possível salvar a foto agora. Sua foto do Google e as iniciais continuam valendo.',
      photoForbidden:
        'Não foi possível salvar a foto agora. Entre de novo na conta e tente outra vez.',
      photoNetwork: 'Não deu para enviar a foto agora. Tente de novo.',
    },
  },
};

const en: AuthCopy = {
  entrance: {
    headline: 'A space for the life you share.',
    google: 'Continue with Google',
    apple: 'Apple',
    email: 'Email',
    guest: 'Continue with just a name',
    waiting: 'Connecting…',
    back: 'Back',
    invited: {
      headline: (by, space) => `${by} invited you to the ${space} space.`,
      lede: 'You will both see the same day: what each of you took on and what is already done.',
      today: 'Your day together',
      expired: 'This invite has expired.',
      expiredHint: 'Ask whoever invited you for a new link.',
      otherAccount: 'Someone',
    },
    legal: {
      lead: 'By continuing you accept the',
      terms: 'Terms',
      and: 'and the',
      privacy: 'Privacy Policy',
    },
  },
  login: {
    title: 'Log in',
    subtitle: "Use your account's email and password.",
    submit: 'Log in',
    forgotLink: 'Forgot my password',
    signUpLink: 'Create account',
    divider: 'OR',
    google: 'Sign in with Google',
    apple: 'Sign in with Apple',
    anonymous: 'Continue with just a name',
  },
  anonymous: {
    title: 'Continue with just a name',
    subtitle: 'No email, no password. Just the name shown in your spaces.',
    submit: 'Continue',
    notice:
      'This account stays on this device. Switching phones or uninstalling the app takes the ideas with it. You can link it to an email or to Google later, without losing anything.',
    backToLoginLink: 'Back to log in',
    settingsNote: 'Account on this device only',
  },
  signUp: {
    title: 'Create account',
    subtitle: 'Takes less than a minute.',
    submit: 'Create account',
    backToLoginLink: 'I already have an account',
  },
  forgot: {
    title: 'Reset password',
    subtitle: "Enter your account email and we'll send a reset link.",
    submit: 'Send recovery email',
    backToLoginLink: 'Back to log in',
    sent: email => `Recovery email sent to ${email}.`,
  },
  fields: {
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    name: 'Name',
  },
  fieldErrors: {
    nameRequired: 'Enter a name.',
    emailRequired: 'Enter your email.',
    emailInvalid: 'Invalid email.',
    passwordRequired: 'Enter your password.',
    passwordTooShort: 'Password needs 6 characters or more.',
    confirmPasswordMismatch: "Passwords don't match.",
  },
  errors: {
    'invalid-credential':
      "Email or password didn't match. Check and try again.",
    network: 'No connection right now.',
    'email-in-use': 'This email already has an account. Log in instead?',
    'too-many-requests':
      'Too many attempts in a row. Wait a bit and try again.',
    'requires-recent-login':
      'It has been a while since you signed in. Confirm it is you to carry on.',
    // Never rendered: a cancelled sheet leaves the screen exactly as it was.
    cancelled: '',
    'play-services-unavailable':
      'Google Play Services is not available on this device. Email and password still works.',
    'provider-misconfigured':
      'This install is not authorised for Google sign-in (its signature is not registered). Email and password still works.',
    'provider-unavailable':
      'This way in is unavailable right now. Email and password still works.',
    'account-exists-with-different-credential':
      'This email already signs in another way. Use that one to continue.',
    unknown: "Something didn't work.",
  },
  retry: 'Try again',
  account: {
    label: 'Account',
    signOut: 'Log out',
    signOutGuestTitle: 'Log out of the guest account?',
    signOutGuestBody:
      'It only exists on this phone. Logging out takes your tasks and spaces with it, and there is no way back into it. To keep everything, link an e-mail or Google first.',
    signOutGuestConfirm: 'Log out anyway',
    delete: 'Delete account',
  },
  deleteAccount: {
    title: 'Delete your account?',
    body: 'There is no undo. This goes now and it goes for good:',
    losses: [
      'Your profile, your username and your photo',
      'Your tasks and spaces, on this device and in the account copy',
      'The spaces you own come down for everyone in them',
      'Your place in other people\u2019s spaces',
    ],
    passwordLabel: 'Password',
    passwordHint: 'Confirm the account password to delete it.',
    confirm: 'Delete account',
    cancel: 'Cancel',
    busy: 'Deleting\u2026',
    proofTitle: 'Confirm it is you',
    proofBody:
      'It has been a while since you signed in. Sign in again and the deletion carries on.',
  },
  profile: {
    title: 'Profile',
    subtitle: 'This is how other people recognise you in shared spaces.',
    edit: 'Edit profile',
    displayNameLabel: 'Display name',
    displayNamePlaceholder: 'What people call you',
    handleLabel: 'Username',
    handlePlaceholder: 'your_name',
    handleHint: '3–20 characters: lowercase letters, numbers and _',
    changePhoto: 'Change photo',
    removePhoto: 'Remove photo',
    photoAction: 'Change profile photo',
    photoUploading: 'Uploading the photo',
    submit: 'Save',
    saved: 'Profile updated',
    errors: {
      displayNameRequired: 'Pick a display name.',
      handleTooShort: 'The username needs 3 characters or more.',
      handleTooLong: 'The username goes up to 20 characters.',
      handleInvalidChars:
        'Use only lowercase letters, numbers and _ in the username.',
      handleTaken: 'That username is with someone else. Try another one.',
      refused: 'The server turned this change down. Try again in a moment.',
      network: "Couldn't save right now. Try again.",
      forbidden: 'Sign in again to save the profile.',
      photoStorageUnavailable:
        "Couldn't save the photo right now. Your Google photo and initials still work.",
      photoForbidden:
        "Couldn't save the photo right now. Sign in again and try once more.",
      photoNetwork: "Couldn't upload the photo right now. Try again.",
    },
  },
};

export function getAuthCopy(language: AuthLanguage): AuthCopy {
  return language === 'en-US' ? en : pt;
}
