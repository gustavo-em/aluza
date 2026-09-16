# Captura por voz — `/api/voice`

O `+` da aba Tarefas abre uma folha sem teclado: pauta, disco amarelo e uma
linha dizendo que dá para falar várias tarefas de uma vez. A pessoa fala, o
app grava, manda o áudio, e o que volta é uma prévia de tarefas com prazo e
prioridade. O texto transcrito nunca aparece — o que a pessoa confere são as
tarefas, não uma transcrição para revisar.

Desenho aprovado: projeto Claude Design, arquivo
`Captura por voz - A folha que ouve.dc.html` (+ `implementacao-captura-por-voz.md`).

## As peças

| Camada             | Arquivo                                                           |
| ------------------ | ----------------------------------------------------------------- |
| Máquina de estados | `src/features/tasks/presentation/models/voiceCapture.ts`          |
| Folha              | `src/features/tasks/presentation/views/voice/VoiceSheet.tsx`      |
| Views              | `views/voice/{VoiceDisc,Trace,Staff,Notice,PreviewCard}.tsx`      |
| Portas             | `src/features/tasks/application/ports/VoiceCapture.ts`            |
| Cliente            | `src/features/tasks/infrastructure/voice/firebaseVoiceCapture.ts` |
| Função             | `functions/voice.js` (+ `interpretCore.js`, `session.js`)         |

## O contrato

```
POST /api/voice
  { audio: base64, mime: 'audio/m4a', language: 'pt-BR' | 'en-US',
    durationMs, today: 'YYYY-MM-DD' }

200 → { tasks: [{ title, dueAt, dueSaid?, priority, span? }] }
      tasks vazio = não ouvi nada (não é erro)
501 → sem chave, ou chave Anthropic (só a OpenAI transcreve)
401 → sem sessão · 400 → sem áudio · 413 → áudio acima de 8 MB
429 → passou do limite do dia · 502 → falha no provedor
```

**Nada é inventado.** `dueAt` é `null` quando nada foi dito sobre quando, e
`priority` é `null` a menos que a urgência tenha sido falada — "preciso" e
"tenho que" são jeitos de falar, não prioridades. O app não preenche nenhum
dos dois: a ficha vazia convida a definir.

`dueSaid` é a palavra que foi dita ("sexta", "essa semana"), para a ficha
mostrar as duas coisas: **"essa semana · dom, 20 set"**. `span` é o trecho
literal da fala; sem trecho, sem citação.

### Quem faz a conta dos dias

O modelo devolve um **token**, não uma data: `today`, `tomorrow`,
`this-week`, `next-week`, `weekend`, `weekday:0..6`, `in-days:N` ou
`date:YYYY-MM-DD`. Quem resolve é o `resolveDue` em `interpretCore.js`,
contra o `today` que o celular mandou. Modelos erram aritmética de calendário
e acertam nomes de dia; e "esta semana = domingo" é regra de produto, que
merece estar em código testável em vez de numa frase do prompt.

O dia da semana dito hoje mesmo significa hoje ("quarta" dita numa quarta), e
o `today` vem do aparelho porque o servidor está noutro fuso.

## Base64, não multipart

O áudio sobe como base64 dentro de JSON. Custa um terço a mais de bytes que
um multipart e economiza um parser de multipart dentro da função. Para um
minuto de fala (~500 KB em AAC) a troca compensa.

## Qualidade do áudio e escolha do modelo (medido em 2026-09-16)

Duas coisas foram descobertas testando contra o endpoint publicado, e as
duas mudam o resultado por completo:

**Gravar a 16 kHz destrói a fala.** Uma nota codificada em AAC 16 kHz no
bitrate padrão voltou como "pega al lazo manta"; as mesmas palavras a 44,1 kHz
e 64 kbps voltaram inteiras. Modelos de fala reamostram para 16 kHz sozinhos —
gravar já em 16 kHz não economiza o passo, só joga o detalhe fora antes. O
gravador usa **AAC mono, 44,1 kHz, 64 kbps**: cerca de 480 KB no minuto cheio.

**`whisper-1`, não os `gpt-4o-*-transcribe`.** Com `language=pt` explícito, o
mini e o completo inventaram palavras em todas as amostras — "Membrada la
igaparo aŭdentis" para "lembrar de ligar para o dentista". O whisper leu as
mesmas gravações quase exatamente.

## Custo

Transcrição `whisper-1` a US$ 0,006/min mais a leitura em `gpt-4o-mini`
(~US$ 0,00015). Uma nota de 20 segundos sai por volta de US$ 0,002. Uma
captura falada conta **2** no limite diário de 100, que é compartilhado com
`/api/interpret`.

## Sem chave, sem rede, sem microfone

Nada quebra. O `VoiceRecorder` tem uma implementação
`unavailableVoiceRecorder` que responde "indisponível", e nesse caso o `+`
abre a folha de digitar de sempre. Sem rede, o disco fica neutro e a folha
diz que escrever continua funcionando. Microfone negado, a folha mostra o
aviso e o botão "Abrir Ajustes".

## Uma folha só (2026-09-16, depois do teste no aparelho)

A folha de voz separada saiu. O `+` abre a folha de escrever de sempre —
campo focado, teclado, fichas — e **o microfone mora dentro dela**:

- campo vazio: disco grande embaixo do campo, com "Fale várias tarefas de uma
  vez, com prazo" (e o exemplo falado até a primeira gravação);
- com texto: o disco vira um botão de 36 ao lado do que está sendo escrito.

Tocar no microfone abre a folha de voz **já gravando**. Ela não tem mais
postura de espera, nem a pauta de três linhas: quem toca num microfone não
quer ver um segundo microfone, e a pauta era uma metáfora que ninguém pediu.

Enquanto o servidor responde, o rastro só desbota — a coreografia de deitar
nas linhas fazia a espera parecer mais longa do que é.

A ficha de espaço na prévia aparece só quando as tarefas vão para um espaço
de verdade; "em Só para mim" era uma frase respondendo uma pergunta que
ninguém tinha feito.

Com isso o `typedStreak` perdeu função e saiu: a folha já abre digitando
sempre.

## Revisão pós-crítica (2026-09-16)

Seis ajustes sobre a base aprovada, do arquivo
`Captura por voz - Revisao pos-critica.dc.html`:

1. **Campo que parece campo.** Em `ready` o campo é uma caixa de 52 com
   borda, lápis e verbo ("Escrever uma tarefa"). O campo de 21 px sem foco
   lia como um título já escrito, e ninguém tocava nele.
2. **Legenda com o diferencial**, em tinta: "Fale várias tarefas de uma vez,
   com prazo". Explicar o toque é trabalho do botão. O exemplo falado
   aparece só até a primeira gravação.
3. **O silêncio pergunta antes de cortar.** Saiu o corte em 2 s — isso é o
   tamanho de uma pausa pensando. Aos 3 s a folha pergunta e um anel começa a
   fechar; voltar a falar apaga os dois; aos 8 s ela para sozinha. Tocar
   sempre para.
4. **Nada inventado na prévia** (acima), com correção em um toque: a ficha de
   prazo abre um painel no lugar da citação, com "dito: 'sexta'" e atalhos
   (hoje · amanhã · o dia lido · sem prazo · calendário); a de prioridade
   cicla sem prioridade → baixa → média → alta.
5. **Sem mínimo de espera.** Saiu o piso de 900 ms: o rastro deitando é a
   resposta ao toque, e o resultado entra quando chega. Numa falha o áudio
   fica guardado e o disco vira "Enviar de novo" — reenvia o mesmo áudio,
   nunca pede para repetir.
6. **Streak de digitação: 3.** Persistido em `AppPreferences`
   (`typedStreak`, `voiceCaptureUsed`); uma gravação zera o streak.

## Armadilhas de layout encontradas no aparelho (2026-09-16)

Três, todas com o mesmo sintoma — a folha ficava alta demais e alguma coisa
sumia — e nenhuma delas aparece nos testes de componente:

1. **`PressableScale` cresce por padrão** (`flexGrow: 1` na view interna).
   O disco esticou para 550dp e empurrou a legenda para fora da tela; o
   "Falar de novo" comeu 58% da folha. Todo pressable numa coluna com irmãos
   precisa de altura explícita.
2. **`ScrollView` numa coluna que se ajusta ao conteúdo colapsa para zero.**
   A prévia ficava montada, com posição, e invisível atrás do rodapé. Na
   postura de prévia a folha passou a ter `height: 76%` e a lista `flex: 1`.
3. **Ref lido dentro de worklet congela.** `useFrameCallback` capturou o ref
   do instante inicial, então `startedAt.current = Date.now()` não escrevia
   nada; o tempo decorrido virava a época Unix inteira e o corte de 1 minuto
   encerrava a gravação 200 ms depois de começar. Virou `useSharedValue`.

## Privacidade — o que precisa estar declarado

O áudio sai do aparelho, então a declaração deixa de ser opcional antes de
qualquer distribuição (TestFlight externo, App Store, Play).

Feito no repositório:

- `public/privacidade.html` ganhou a seção 5 ("Captura por voz"), a permissão
  `RECORD_AUDIO` na lista do Android, a OpenAI na lista de terceiros, e a
  correção da frase que dizia que o app não pedia microfone. Só vale depois de
  `firebase deploy --only hosting`.
- `PrivacyInfo.xcprivacy` declara `NSPrivacyCollectedDataTypeAudioData`
  (vinculado à conta, finalidade "funcionalidade do app", sem rastreamento).
- `NSMicrophoneUsageDescription` no `Info.plist` — hoje só em português; uma
  `InfoPlist.strings` em inglês seria o passo seguinte.

Nos consoles, por conta do dono:

- **App Store Connect → App Privacy**: acrescentar _User Content → Audio Data_,
  vinculada à identidade, finalidade _App Functionality_, sem rastreamento.
- **Play Console → Data safety**: _Audio → Voice or sound recordings_,
  coletada, compartilhada com terceiro (OpenAI), finalidade funcionalidade do
  app; transmitida criptografada; não retida por nós.

O que o servidor faz: `functions/voice.js` mantém o áudio em memória durante o
pedido e não escreve nada — nem Firestore, nem Storage, nem log com o
conteúdo. O aparelho guarda a última gravação por 5 minutos (`audioCacheMs`)
para o reenvio.

## O que falta

- **Rebuild nos dois sistemas** depois da instalação do gravador nativo
  (`pod install` no iOS, gradle no Android).
- **Descoberta (§10 da spec)** — `capturePrefs`, `typedStreak`,
  `discoveryHint`. Os textos existem; as flags de conta não.
- **Telemetria (§11)** — nenhum evento ainda.

## Testes

- `__tests__/voiceCapture.test.ts` — a máquina de estados: posturas, juntar,
  apagar com Desfazer, limite de 20 com segunda rodada, silêncio, relógio.
- `__tests__/voiceSheet.test.tsx` — a folha: abre sem teclado, ouve, mostra
  prazo e prioridade e a citação, cria no espaço certo, microfone negado,
  leitor fora do ar.
- `__tests__/interpretCore.test.js` — `spans` alinhados e idioma da transcrição.
