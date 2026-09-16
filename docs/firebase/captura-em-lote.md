# Captura em lote — `/api/interpret`

Na aba Tarefas há um botão menor acima do "+" ("Adicionar várias tarefas") e,
na captura normal, uma linha "Parece 3 tarefas. Separar" quando o texto tem
cara de lista. Os dois abrem a mesma folha: a pessoa dita (microfone do
teclado) ou cola um texto com várias tarefas, o app separa em uma prévia
editável (juntar com a de cima, remover, escolher um espaço para todas) e um
botão adiciona todas de uma vez.

## O que funciona sem servidor

A separação é local, feita de padrões (`src/features/tasks/domain/CaptureBatch.ts`).
Em ordem:

1. **Sempre separam**: quebra de linha, marcador de lista (`-`, `•`, `1.`) e `;`.
2. **Separam com contagem de palavras**: ponto final, vírgula e conectivo
   ("e / depois / também / aí"), só quando os dois lados têm palavras
   suficientes para serem tarefas — "comprar pão, leite e ovos" continua uma
   tarefa só.
3. **Separam pelo verbo**, quando não sobrou pontuação nenhuma. É o caso do
   ditado: o microfone do teclado entrega "comprar pão amanhã pagar a luz
   sexta ligar pro contador" sem uma vírgula, e sem essa regra a frase
   inteira virava um título só. Um verbo de tarefa (`TASK_VERBS`) abre a
   próxima tarefa, com três guardas:

   - preposição antes cancela — "ligar pro banco **para pagar** o boleto" é
     uma tarefa;
   - verbo antes cancela — "ir **comprar** pão" é uma tarefa;
   - viagem antes cancela — "**ir ao mercado** comprar pão" é o que a ida
     serve, não a próxima tarefa.

   A vírgula que não passou na contagem baixa a exigência: "comprar pão,
   ligar pro banco" separa, porque tem verbo depois da vírgula, enquanto
   "comprar pão, leite e ovos" não tem.

4. **Preâmbulo falado sai do título**: "preciso", "tenho que", "lembrar de",
   "não esquecer de", "remember to" — mas só quando o que sobra começa com
   verbo. "preciso de leite" e "vou ao dentista" ficam inteiros.
5. **Hora solta volta pra tarefa anterior**: "pagar a luz sexta, às nove da
   manhã" é uma tarefa com hora, não uma tarefa chamada "às nove da manhã".

Cada pedaço passa pelo mesmo `parseCapture` da captura normal, então data,
prioridade (`!alta`), espaço (`#casa`) e estimativa (`~30min`) valem igual.

Nada disso precisa de chave, rede ou deploy. É o que está no app hoje, e é o
que continua valendo sem internet ou sem crédito na API.

As regras são de propósito conservadoras: uma separação que não acontece se
resolve editando o texto; uma que acontece errado vira uma tarefa que alguém
precisa apagar. Verbo que falta na lista não custa nada — a frase só fica
como foi dita.

## O que a IA acrescenta

Uma ação discreta na prévia, "Separar melhor", chama a função
`interpretCapture` (`functions/interpret.js`), que manda o texto para um modelo
e recebe de volta **uma linha por tarefa, já na sintaxe de captura**. O app
não aprende campo novo: continua lendo cada linha com `parseCapture`. A
resposta substitui a prévia com "Desfazer" por 5 segundos; a IA nunca mexe na
prévia sozinha.

A ação só aparece quando o app foi montado com um intérprete
(`captureInterpreter` em `src/app/App.tsx`). Se a função não estiver
publicada ou sem chave, ela responde `501` e a folha mostra "Não deu para usar
a IA agora. A separação continua valendo."

### Provedores

A função lê **um** segredo, `INTERPRET_API_KEY`, e descobre o provedor pelo
formato da chave (`providerFor`, `functions/interpretCore.js`):

| Chave começa com | Provedor  | Modelo                      |
| ---------------- | --------- | --------------------------- |
| `sk-ant-`        | Anthropic | `claude-haiku-4-5-20251001` |
| `sk-` (outros)   | OpenAI    | `gpt-4o-mini`               |

O deploy **exige que o segredo exista** (erro "Cloud Secret Manager has no
latest version of the secret defined by param …" quando não existe). Sem
chave ainda, guarde a palavra `none`: a função responde `501` até uma chave
de verdade entrar, e trocar de provedor é só gravar outro valor, sem mexer no
código.

**Assinatura do ChatGPT (Plus) ou do Claude (Pro/Max) não serve.** São planos
do chat, sem chave. A chave vem do painel de desenvolvedor de cada empresa e
é cobrada por uso, à parte da assinatura:

- OpenAI: <https://platform.openai.com/api-keys> (billing em Settings → Billing).
- Anthropic: <https://console.anthropic.com/settings/keys>.

### Créditos, não assinatura (checado em 2026-09-16)

Com a chave da OpenAI no lugar, a função respondeu `502` e o log trouxe
`upstream refused openai 429` com
`"You have no credits remaining"` / `credit_balance_exhausted`. A chave era
válida (`GET /v1/models` respondeu 200); o que falta é **saldo na plataforma
de API**, que é comprado à parte do ChatGPT Plus em
<https://platform.openai.com/settings/organization/billing/>. Enquanto não
houver saldo, o app mostra "Não deu para usar a IA agora" e a separação local
continua valendo — nada quebra.

Custo de referência com `gpt-4o-mini` ou Haiku: uma nota de 300 caracteres
com os exemplos do prompt fica na casa de 600 tokens de entrada e 100 de
saída — frações de centavo por leitura. O limite é de 100 leituras por conta
por dia (`DAILY_LIMIT`), contadas em `interpretUsage/{uid}` no Firestore, e
notas acima de 1500 caracteres são cortadas.

### Publicar

```bash
firebase functions:secrets:set INTERPRET_API_KEY   # cole a chave, ou "none" por enquanto
firebase deploy --only functions,hosting
```

Para trocar a chave depois, o mesmo `secrets:set` e um novo deploy da
função (a versão nova do segredo só é lida quando a função é publicada de
novo).

O rewrite `/api/interpret` em `firebase.json` é o que dá um endereço fixo à
função; o app chama `https://ideiasorganizetask.web.app/api/interpret` com o
token de sessão (Firebase Auth) no `Authorization` e o cabeçalho do App Check.
Sem sessão, `401`; sem texto, `400`; acima do limite do dia, `429`.

### Regra do Firestore

A coleção `interpretUsage` é escrita só pelo Admin SDK da função; as regras
não precisam liberar nada para o app.

## Testes

- `__tests__/captureBatch.test.ts` — separação local e o caso de uso.
- `__tests__/batchCaptureSheet.test.tsx` — a folha: prévia, juntar, remover,
  espaço, limite de 20, IA com desfazer e erro.
- `__tests__/interpretCore.test.js` — prompt, escolha de provedor e leitura
  da resposta, sem rede.
