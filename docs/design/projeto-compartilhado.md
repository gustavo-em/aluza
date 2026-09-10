# Projeto compartilhado — compartilhar com amigos

Especificação de implementação da feature de compartilhamento na aba
**Projetos**, desenhada em `5c` (fase 1) e `5b` (fase 2). O modelo `5a`
(atribuir dono por tarefa) foi descartado — ele empurra o produto para
gerenciador de equipe, que a pesquisa de mercado não pediu.

Sugestão de destino: `docs/design/projeto-compartilhado.md`.

## Pré-requisito honesto

O README diz que conta e sincronia em nuvem são a **fatia 3** e ainda não
existem. Compartilhar é a primeira feature que **não** cabe em
`AsyncStorage`: exige identidade e um estado que dois aparelhos leem. Esta
especificação assume que a fatia 3 vem antes (ou junto), e descreve o que a
feature acrescenta em cima dela.

O que ela **não** pede: tempo real, presença ao vivo, comentários,
notificação _push_. O que muda do outro lado aparece quando o app abre ou
quando a lista é puxada para baixo.

## Princípio que não se negocia

> **O projeto é compartilhado. O placar não.**

Cada pessoa pontua o peso do que ela fecha (`TASK_WEIGHT`: baixa 5, média 12,
alta 25). Sequência, nível e o gráfico da semana continuam individuais. Placar
de grupo transformaria "peso, não quantidade" em competição por volume — que é
exatamente o erro do Karma que o `MARKET.md` cita como motivo do recorte.

Consequência de implementação: `ProgressState` **nunca** sai do aparelho para o
grupo. Ela continua em `asyncStorageProgressStore` e, se sincronizar, sincroniza
só para os outros aparelhos do mesmo dono.

## Fase 1 — `5c`: link, dois papéis, lista de quem entrou

### Domínio — `domain/TaskList.ts`

`TaskList` ganha um campo opcional. Opcional para que todo projeto local
existente continue válido sem migração:

```ts
export const listRoles = ['owner', 'editor', 'viewer'] as const;
export type ListRole = (typeof listRoles)[number];

export interface ListMember {
  personId: string;
  /** Nome curto de exibição; iniciais saem daqui. */
  name: string;
  role: ListRole;
  /** Convite aceito ou ainda pendente. */
  joined: boolean;
}

export interface ListShare {
  /** Sufixo público do link: ideias.app/p/<token>. */
  token: string;
  /** O que quem abre o link recebe. */
  invitedAs: Exclude<ListRole, 'owner'>;
  members: readonly ListMember[];
}

export interface TaskList {
  id: string;
  name: string;
  color: ListColor;
  icon: ProjectIcon;
  share?: ListShare; // ausente = projeto só seu
}
```

Funções puras novas, no mesmo arquivo, testáveis sem React e sem rede:

| Função                                              | Regra                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `isShared(list)`                                    | `list.share != null && list.share.members.length > 1`                                   |
| `canEdit(list, personId)`                           | Sem `share`, o dono local pode tudo. Com `share`, `owner` e `editor` editam.             |
| `memberInitials(name)`                              | Duas letras, maiúsculas, sem acento — reuse `stripAccents`, que já existe aqui.          |
| `withMember(list, member)` / `withoutMember(...)`   | Devolvem lista nova; nunca mutam.                                                        |
| `canShare(list)`                                    | `false` para `INBOX_LIST_ID`: a lista Avulsas é a caixa de uma pessoa, e compartilhá-la não faz sentido. |

`sanitizeLists` precisa sanear `share` com o mesmo rigor que já aplica ao
resto: entrada de disco é entrada não confiável — `token` string não vazia,
`invitedAs` dentro de `listRoles`, membros com `personId` e `name` válidos,
duplicados descartados. Sem `share` válido, o projeto volta a ser local em vez
de virar um objeto meio formado.

### Porta e adaptador

Uma porta nova em `application/ports/`, no formato das que já existem
(`ListStore`, `TaskStore`):

```ts
// application/ports/ShareGateway.ts
export interface ShareGateway {
  createLink(listId: string, invitedAs: ListRole): Promise<ListShare>;
  revokeLink(listId: string): Promise<void>;
  removeMember(listId: string, personId: string): Promise<void>;
  /** Estado remoto do projeto, para a atualização ao abrir. */
  pull(listId: string): Promise<{ list: TaskList; tasks: readonly Task[] }>;
}
```

O adaptador concreto vive em `infrastructure/sharing/` e é construído **só** em
`app/App.tsx`, como o AsyncStorage já é. Nenhum caso de uso importa `fetch`.

### Casos de uso — `application/useCases/shareTaskList.ts`

Assinatura no padrão do repositório: recebe o `Workspace`, devolve
`{ workspace, events }`. Não salva, não navega, não fala com a rede — a chamada
ao gateway acontece na camada de _view-model_, e o resultado entra por aqui.

- `shareTaskList(workspace, listId, invitedAs, share)` → grava o `share` na lista.
- `stopSharing(workspace, listId)` → remove o `share` e mantém as tarefas.
- `removeMember(workspace, listId, personId)`.
- `acceptInvite(workspace, incoming)` → adiciona o projeto e as tarefas
  recebidas. **Conflito de `id`:** `createList` deriva o id do nome, então dois
  "Lançamento" colidem. Ao aceitar, o id do projeto recebido passa a ser
  prefixado pelo token (`lancamento@7k2`), e o `INBOX_LIST_ID` nunca é aceito.

### Eventos — `domain/TaskEvent.ts`

Recurso novo é assinante novo (ADR 0002). Quatro eventos, no tempo verbal dos
existentes:

`list.shared` · `list.unshared` · `list.member.joined` · `list.member.removed`

Assinantes: persistência (já existe), telemetria (`consoleUsageReporter`) e
háptico no `list.shared` — compartilhar é o tipo de confirmação que merece um
toque. **Nenhum** assinante de pontuação: ver o princípio acima.

### Telas

**`ListsScreen.tsx`** — a linha do projeto ganha, à direita do nome, a pilha de
iniciais (fichas de 28px, `marginLeft: -9` a partir da segunda, borda de 2px na
cor do cartão). Máximo de três fichas; a partir daí, `+N` na mesma métrica.
Subtítulo da linha passa a `${pessoas} pessoas · ${done}/${total}` quando
compartilhado, e segue como está quando não. O menu de `MoreGlyph` ganha
**Compartilhar** entre _Renomear_ e _Excluir_ — e a entrada não aparece quando
`canShare(list)` é falso.

**`views/ShareSheet.tsx`** (nova) — mesma casca do `ProjectEditorSheet`, sem
inventar geometria:

| Elemento         | Vem de                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| `Modal` + `Overlay` + `Scrim` | Iguais aos do `ProjectEditorSheet`; `scrim` é token do tema.          |
| Entrada/saída    | `SlideInDown.springify().damping(20).stiffness(200)` / `SlideOutDown.duration(180)` |
| Casca            | `background`, cantos de cima em `radii.extraLarge`, padding `medium/large`          |
| Grabber          | 36×4, `radii.pill`, cor `border`                                                    |
| Título           | `type.heading` (19), peso 800, _tracking_ −0,4                                       |
| Dica             | `muted`, `type.label` (13), _line-height_ +5                                         |
| Campo do link    | Campo do `ProjectEditorSheet`: borda 2px `accent`, `radii.medium`, fundo `card`. Texto em monoespaçada, `numberOfLines={1}`. |
| Botão Copiar     | `Submit`: fundo `accent`, texto `onAccent`, `radii.medium`                            |
| Papéis (Ver/Editar) | Fichas do `GroupingButton` do `TodayScreen`: `min-height: 48`, borda `accent` e fundo `cardElevated` quando selecionada, `CheckGlyph` de 14px na selecionada |
| Lista de membros | Linhas de 48px, ficha de 30px com iniciais em `type.caption` (11), papel à direita em `muted` |
| Remover          | `danger`, `type.label`, peso 700                                                     |
| Rodapé           | `Footer` do `ProjectEditorSheet`: Fechar (`mutedStrong`) + Convidar (`accent`)        |

Regras da folha: o link é revelado só depois de existir — antes disso o botão
principal é **Criar link**, e a mudança de papel Ver↔Editar vale para quem
entrar depois, não para quem já entrou (dizer isso em uma linha de `muted`
embaixo das fichas).

**Copy** — `taskCopy.ts`, dentro de `lists`, nos dois idiomas:

```
share, shareHint, createLink, copyLink, linkCopied, invitedAs,
roleViewer, roleEditor, roleOwner, members, pendingInvite,
removeMember, removeMemberConfirm(name), stopSharing, sharedWith(count)
```

`sharedWith` conjuga: "1 pessoa" / "3 pessoas". O teste de `taskCopy` já cobre
paridade entre `pt-BR` e `en-US`.

### Estados que a tela precisa desenhar

1. **Só seu** — nada muda na linha do projeto.
2. **Link criado, ninguém entrou** — uma ficha (você) e o rótulo "convite
   pendente" na folha.
3. **Compartilhado** — pilha de fichas na linha; badge nenhum no título.
4. **Você é `viewer`** — caixas de tarefa desabilitadas, sem FAB de adicionar,
   e a folha mostra papéis sem poder mudá-los. É o estado mais fácil de
   esquecer e o que mais quebra confiança se falhar.
5. **Sem rede** — a folha abre com o que está em disco e o botão de criar link
   fica desabilitado com uma linha em `muted`; nada de _spinner_ infinito.
6. **Projeto excluído pelo dono** — quem era membro recebe as tarefas movidas
   para Avulsas, exatamente como `deleteList` já faz localmente
   (`copy.lists.deleteDetail` continua verdadeira).

## Fase 2 — `5b`: o combinado do dia

Só depois da fase 1 estar em produção. Acrescenta uma faixa de Sol no topo do
projeto compartilhado com **quem levou o quê para hoje** — nome, tarefa, e se
está em foco, fechada ou nem começou.

- Novo modelo puro `presentation/models/sharedDay.ts`:
  `sharedDay(members, tasks, nowMs) → readonly { member, task | null, state: 'focusing' | 'done' | 'open' | 'absent' }[]`.
  Ordem: em foco, depois aberto, depois fechado, depois ausente — quem está
  trabalhando aparece primeiro.
- O estado `focusing` exige publicar `focus.started`/`focus.finished` para o
  grupo. É a **única** parte da feature que precisa de algo perto de tempo
  real; se isso for caro, a fase 2 sai sem `focusing` e mostra só levou/fechou.
- "Sequência do grupo" = dias em que **todos** fecharam a tarefa que levaram.
  Deriva de `DayRecord` de cada membro; se o dado de outra pessoa não chegar, o
  dia não conta como fechado — nunca chute.
- A faixa não substitui o `AgoraCard`: o dia individual continua sendo a
  primeira coisa da aba Tarefas.

## Ordem de implementação

| #   | Onde                                                    | O que                                                                 |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `domain/TaskList.ts` **+ teste**                        | Tipos, funções puras, saneamento de `share`.                          |
| 2   | `domain/TaskEvent.ts`                                   | Os quatro eventos.                                                    |
| 3   | `application/ports/ShareGateway.ts`                     | A porta, só a interface.                                              |
| 4   | `application/useCases/shareTaskList.ts` **+ teste**     | Os quatro casos de uso, incluindo a colisão de id em `acceptInvite`.   |
| 5   | `infrastructure/sharing/*`                              | Adaptador concreto + `__mocks__` para os testes.                      |
| 6   | `presentation/views/ShareSheet.tsx`                     | A folha, na casca do `ProjectEditorSheet`.                            |
| 7   | `presentation/screens/ListsScreen.tsx`                  | Pilha de iniciais, item de menu, estados 1–6.                         |
| 8   | `presentation/localization/taskCopy.ts`                 | As strings, nos dois idiomas.                                         |
| 9   | `app/App.tsx`                                           | Construção do gateway concreto e do `personId` da conta.              |
| 10  | `npm run validate`                                      | Formatação, lint, tipos, testes.                                      |
| 11  | `docs/adr/`                                             | ADR curta: por que o placar não é do grupo. É a decisão que alguém vai querer reverter em seis meses. |

## O que o push escreve (e o que ele apaga sem querer)

A escrita de conteúdo do espaço é um `PATCH` REST com `updateMask`. A regra do
Firestore é dura: **campo citado na máscara e ausente do corpo é apagado**, e
campo fora da máscara fica como está. Foi assim que os grupos sumiram — a
máscara pedia `groups`, o corpo não mandava, e todo push do dono limpava os
grupos do espaço no servidor. Do outro lado, `groups` ausente é lido como
"cliente antigo, não mexa", então a outra pessoa nunca via o grupo e a tarefa
dele caía na lista solta.

Máscara e corpo agora saem do mesmo lugar, `infrastructure/sharing/sharePushWrite.ts`,
usado pelo gateway REST e pelo duplo de teste — que também apaga o que a máscara
cita e o corpo não traz, para o teste não ser mais gentil que o servidor. Campo
novo entra nos dois de uma vez, ou os testes reprovam.

Um espaço que já perdeu `groups` no servidor se conserta sozinho: basta quem
tem os grupos no aparelho abrir o app e mexer no espaço; o push seguinte
reescreve o campo e a outra pessoa recebe tudo no pull. Não há migração.

Ponto frágil vizinho, registrado de propósito: `acceptInvite` sufixa `task.id`
com `@<token4>` para não colidir com o que já existe no aparelho, e **não**
sufixa `groupId`. Funciona porque `sanitizeGroups` preserva o id do grupo como
veio do servidor; quem mexer em um dos dois tem que olhar o outro.

## Decisão de 2026-09-10 — quem põe alguém numa tarefa

**Qualquer membro que possa editar o espaço (`owner` ou `editor`) põe e tira
qualquer pessoa do espaço de qualquer tarefa.** `viewer` não atribui ninguém,
nem a si mesmo, e para ele a seção "Pessoas" simplesmente não existe na folha
de edição — nada desabilitado na tela.

O modelo anterior era "o dono move qualquer um, todo mundo move só o próprio
uid": `canToggleAssignment` só devolvia verdadeiro para o dono ou para quem
mexia em si mesmo, a regra tinha `isOwnerAssignmentUpdate` e
`isSelfAssignmentUpdate`, e a folha mostrava a lista de pessoas ao dono e um
único botão "Entrar na tarefa" a todo o resto.

Motivo da mudança, nas palavras do dono: quem não criou o espaço não conseguia
associar outra pessoa a uma tarefa, só entrar nela. Espaço compartilhado aqui
é gente que já confia uma na outra — pedir que a atribuição passe por quem
criou o grupo é atrito que não se paga.

O que isso significa em cada camada:

- **Domínio** (`domain/TaskAssignment.ts`): `canToggleAssignment` recebe o
  papel de quem age, o alvo e os membros do espaço; `owner`/`editor` movem
  qualquer membro, `viewer` e quem não tem papel não movem ninguém. É mais
  estrito que a regra de propósito — o alvo precisa ser membro.
- **Regra** (`docs/firebase/firestore.rules`): `isSelfAssignmentUpdate` deu
  lugar a `isEditorAssignmentUpdate` — membro em `editorIds` escrevendo
  `assignments`, e toda chave tocada tem que estar em `memberIds`.
  `isOwnerAssignmentUpdate` continua. A regra é a autoridade; o domínio só
  espelha.
- **Tela** (`TaskAssignSection.tsx`): um só layout para todo mundo que pode
  editar — o atalho "Entrar na tarefa" no topo e, abaixo, a lista de pessoas
  com alternância por pessoa (`task-assign-<personId>`). Não há mais ramo por
  papel.
- **Espaço só seu**: segue sem seção de pessoas; `assignment` é `undefined`
  fora de projeto compartilhado.

Um editor pode colocar um `viewer` numa tarefa: ele é do espaço. O que o
`viewer` não faz é alterar o mapa.

## Decisões abertas

1. **Link aberto ou convite por pessoa?** Link é 10 segundos de atrito e casa
   com o "sem conta para começar"; convite por pessoa é o único jeito de saber
   quem entrou antes de entrar.
2. **`viewer` existe na fase 1?** Dois papéis dobram os estados de tela. Talvez
   a fase 1 seja só "quem tem o link edita", e `viewer` venha depois.
3. **O que acontece com a tarefa que outra pessoa fechou** enquanto ela estava
   no seu dia? Ela sai do seu dia (e o trio recalcula) ou fica marcada como
   "fechada por Joana"? A segunda é mais honesta e mais trabalhosa.
