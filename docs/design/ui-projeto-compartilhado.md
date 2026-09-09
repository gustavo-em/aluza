# UI do projeto compartilhado — guia de implementação

Só interface. Domínio, portas, eventos e casos de uso estão em
`projeto-compartilhado.md`. Aqui está o que desenhar, com que tokens, em que
arquivo, e o código no estilo do repositório (`styled-components/native`,
`PressableScale`, glifos de `FieldGlyphs`).

Regras que valem para tudo abaixo:

- Nenhum número solto: tamanho vem de `theme.type`, espaço de `theme.spacing`,
  canto de `theme.radii`, cor de `theme.colors`.
- Nada abaixo de `type.caption` (11).
- Texto sobre Sol é sempre `onAccent`.
- Alvo de toque nunca menor que 48px (use `hitSlop` quando o desenho é menor).
- Quem roda `entering`/`exiting`/`layout` não declara `opacity` no próprio
  estilo (aviso do Reanimated, ver `BRAND.md`).

## 1. Peças novas compartilhadas

### 1.1 `views/MemberChip.tsx`

A ficha de iniciais. Um componente, três tamanhos, nada mais.

```tsx
type ChipSize = 'small' | 'medium' | 'large';

const DIAMETER: Record<ChipSize, number> = {
  small: 24, // só ponto de cor, sem letra
  medium: 28, // pilha na linha do projeto e dono de tarefa
  large: 30, // lista de membros na folha
};

interface MemberChipProps {
  name: string;
  /** Cor derivada do membro, não escolhida pela tela. */
  tone: string;
  size?: ChipSize;
  /** Aparece na pilha: recorta a ficha anterior. */
  stacked?: boolean;
  /** Convite ainda não aceito: contorno tracejado, sem preenchimento. */
  pending?: boolean;
}
```

- Letra: `memberInitials(name)` (duas letras), `type.caption` (11), peso 800.
  Em `small` a letra **não** entra — 11px não caberia; use só o `tone`.
- Cor da letra: `onAccent` sobre Sol, `card` sobre as demais. Nunca `text`
  sobre Uva.
- `stacked`: `margin-left: -9px` e `border: 2px solid ${card}` — a borda é o
  que separa duas fichas encostadas.
- `pending`: `border: 2px dashed ${border}`, fundo transparente, letra em
  `mutedStrong`.

```tsx
const Chip = styled.View<{ $d: number; $tone: string; $stacked: boolean }>`
  width: ${({ $d }) => $d}px;
  height: ${({ $d }) => $d}px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $tone }) => $tone};
  border-width: ${({ $stacked }) => ($stacked ? 2 : 0)}px;
  border-color: ${({ theme }) => theme.colors.card};
  margin-left: ${({ $stacked }) => ($stacked ? -9 : 0)}px;
`;
```

**Paleta dos membros:** reuse `listColors` via `projectTone(theme, color)`. A cor
é derivada do `personId` (hash simples, estável) e não sorteada a cada render —
uma pessoa que troca de cor entre telas parece outra pessoa.

### 1.2 `views/MemberStack.tsx`

```tsx
interface MemberStackProps {
  members: readonly ListMember[];
  /** Acima disso, o excedente virá como +N. */
  cap?: number; // padrão 3
}
```

- Fichas `medium`, a primeira sem `stacked`.
- Excedente: uma ficha com fundo `cardElevated`, texto `accentInk`, conteúdo
  `+N` em `type.caption`.
- `accessibilityLabel` da pilha inteira: `copy.lists.sharedWith(members.length)`.
  As fichas individuais são `accessibilityElementsHidden` — o leitor de tela não
  precisa soletrar iniciais.

### 1.3 Dois glifos novos em `views/FieldGlyphs.tsx`

Mesma gramática dos existentes: `viewBox="0 0 16 16"`, `strokeWidth={1.5}`,
`fill="none"`, cor por prop.

```tsx
/** Pessoas: o projeto que deixou de ser de uma só. */
export function PeopleGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Circle cx={6.2} cy={5.6} fill="none" r={2.6} stroke={color} strokeWidth={1.5} />
      <Path d="M1.8 13.4c0-2.4 2-3.9 4.4-3.9s4.4 1.5 4.4 3.9" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.5} />
      <Path d="M11.2 4.2a2.4 2.4 0 0 1 0 4.5M12.2 10.1c1.3.5 2 1.7 2 3.3" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.5} />
    </Svg>
  );
}

/** Link: o que se copia e se manda. */
export function LinkGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path d="M6.4 9.6 9.6 6.4" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.5} />
      <Path d="M8.7 4.6l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M7.3 11.4l-1.1 1.1a2.6 2.6 0 0 1-3.7-3.7l1.1-1.1" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.5} />
    </Svg>
  );
}
```

Não desenhe nada além destes dois. O resto (`CheckGlyph`, `MoreGlyph`,
`ProjectGlyph`, `TrashGlyph`) já existe e cobre a feature.

## 2. `screens/ListsScreen.tsx` — a linha do projeto

O que muda na `ListHeader` já existente, sem tocar na geometria dela
(`radii.large`, padding `spacing.medium`, elevação 2):

```
┌──────────────────────────────────────────────────────────┐
│ [badge 32]  Lançamento              ( JM RS VC )   3/7   │
│ ───────────────────────────────────────────────── trilha │
└──────────────────────────────────────────────────────────┘
             ↑ Name (flex:1)          ↑ MemberStack  ↑ Count
```

- `MemberStack` entra **entre** `Name` e `Count`, dentro do mesmo `Row`
  (que já é `flex-wrap: wrap` com `gap: spacing.small + 3`).
- Quando `isShared(list)` é falso, nada é renderizado ali — nem espaço
  reservado, nem placeholder.
- `Count` continua `copy.lists.progress(done, total)`. Não vire
  "3/7 · 3 pessoas": a pilha já disse.
- A `Track`/`Fill` de progresso não muda: continua o total do projeto, não o de
  cada pessoa.

### 2.1 Menu de ações

O `ListActions` que hoje tem _Renomear_ e _Excluir_ recebe **Compartilhar** na
frente, com a mesma `ActionButton`/`ActionText`:

```tsx
{canShare(list) ? (
  <ActionButton accessibilityLabel={copy.lists.share} onPress={() => setSharing(list)}>
    <ActionText>{copy.lists.share}</ActionText>
  </ActionButton>
) : null}
```

`canShare` é falso para Avulsas — e por isso Avulsas não mostra o `MoreButton`
hoje; nada a fazer ali.

### 2.2 Tarefas de projeto compartilhado

Dentro do `Expanded`, o `TaskCard` ganha uma ficha `medium` no lugar do
`action` quando a tarefa foi fechada por outra pessoa:

- Tarefa aberta: nada de ficha. Ninguém é dono; quem pegar, pega.
- Tarefa fechada por outra pessoa: ficha `medium` do membro, e o título vai
  para `muted` com `line-through` como já vai.
- Se você é `viewer`: `TaskCheckbox` com `disabled`, `AddTaskButton` não
  renderiza, `FloatingAction` de nova tarefa não renderiza.

## 3. `views/ShareSheet.tsx` — a folha

Copie a casca do `ProjectEditorSheet` **inteira** (Modal, Overlay, Scrim,
ScrimTouch, Sheet, Grabber, Title, Hint, Footer, Cancel, Submit,
`BackHandler`) e troque só o meio. Nada de geometria nova.

```
Grabber
Title        Compartilhar Lançamento          type.heading / 800 / -0.4
Hint         Quem abrir o link entra...       muted / type.label / lh +5

[ Campo do link                    ][ Copiar ]   ← antes de existir: botão "Criar link"
Nota         Vale para quem entrar depois     muted / type.caption

QUEM ENTRAR PODE                              PickerLabel
( Ver )  ( ✓ Editar )                          fichas 48px, GroupingButton

NO PROJETO                                    PickerLabel
[VC] Você                              dono
[JM] Joana                            edita
[RS] Rafa  convite pendente        Remover

                       Fechar     [ Convidar ]  Footer
```

### 3.1 Campo do link

```tsx
const LinkRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 2}px;
  border: 2px solid ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.card};
  padding: 13px 14px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const LinkText = styled.Text.attrs({ numberOfLines: 1 })`
  flex: 1;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-variant: tabular-nums;
`;
```

- O padding e a borda são exatamente os do `Field` do `ProjectEditorSheet`, de
  propósito: é o mesmo tipo de superfície, mesmo sem ser editável.
- Botão **Copiar**: `Submit` (fundo `accent`, texto `onAccent`,
  `radii.medium`, padding 8×14 aqui porque está dentro da linha).
- Ao copiar: troque o rótulo para `copy.lists.linkCopied` por 1,2 s e dispare
  `haptics` leve. Sem _toast_ — o app não tem um, e não é aqui que ele nasce.
- Antes de existir link, `LinkRow` não aparece; no lugar dela um `Submit` de
  largura inteira com `copy.lists.createLink`.

### 3.2 Fichas de papel

Reuse literalmente o `GroupingButton`/`GroupingButtonText` do `TodayScreen`
(borda `accent` + fundo `cardElevated` quando selecionada, `min-height: 48`,
`radii.pill`, texto `type.caption + 1` peso 800). `CheckGlyph` de 14px na
selecionada, em `accentInk`.

### 3.3 Linhas de membro

```tsx
const MemberRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  min-height: 48px;
  padding: ${({ theme }) => theme.spacing.small + 4}px 0px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;
```

- Ficha `large` (30px) à esquerda, nome em `type.body` peso 700, papel à
  direita em `muted`/`type.caption`.
- "convite pendente" em `muted`/`type.caption` como segunda linha do nome.
- **Remover** é `danger`, `type.label`, peso 700, e passa por `ConfirmDialog`
  (que já existe, com `destructive`) usando
  `copy.lists.removeMemberConfirm(name)`. Nunca remova no primeiro toque.
- A última linha não tem borda inferior.

### 3.4 Estados da folha

| Estado                 | O que a folha mostra                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| Sem link               | Hint + `Submit` "Criar link". Sem seção de membros.                       |
| Link criado, sozinho   | `LinkRow`, papéis, e uma linha só (você, "dono").                         |
| Compartilhado          | Tudo. `Convidar` no rodapé reabre o compartilhamento do sistema.          |
| Você é `viewer`        | `LinkRow` visível, papéis **desabilitados** (`opacity` não; use `muted` + sem borda `accent`), sem Remover, rodapé só com Fechar. |
| Sem rede               | `Submit` desabilitado (`cardElevated`, texto `onAccent`) + linha em `muted` explicando. Nunca _spinner_ sem fim. |
| Parando de compartilhar | `ConfirmDialog` destrutivo; ao confirmar, a folha fecha e a pilha desaparece da linha do projeto. |

## 4. Fase 2 — `views/SharedDayBand.tsx`

Faixa de Sol no topo do projeto compartilhado aberto. Só depois da fase 1.

```tsx
const Band = styled.View`
  background-color: ${({ theme }) => theme.colors.accent};
  /* Sai do padding do Content e o repõe dentro: nunca use largura de tela. */
  margin: ${({ theme }) => theme.spacing.medium}px
    -${({ theme }) => theme.spacing.large}px 0px;
  padding: ${({ theme }) => theme.spacing.large - 4}px
    ${({ theme }) => theme.spacing.large}px;
`;
```

- Eyebrow "Hoje, no combinado": `type.caption`, peso 800, `letter-spacing: 1.8`,
  maiúscula, cor `onAccent`.
- Uma linha por membro: ficha `large` com fundo `onAccent` e letra `accent`
  (dentro da faixa a ficha inverte, senão desaparece no amarelo), nome + tarefa,
  e à direita o glifo do estado: `FocusGlyph` (em foco), `CheckGlyph` (fechou),
  nada (só levou), ficha tracejada (nem entrou no dia).
- Separador entre linhas: `border-top: 1.5px solid rgba(27,23,16,0.18)` — a
  única cor literal permitida aqui, porque é Tinta a 18% sobre Sol e não existe
  token para ela. Se preferir, declare-a como `onAccentSubtle` no tema.
- Botão "Levar uma para hoje": fundo `text`, texto `accent`, `radii.medium`,
  padding 15px — a inversão Tinta/Sol é reservada para o botão que decide algo.
- Ordem das linhas vem de `sharedDay(...)`, não da tela: em foco, aberto,
  fechado, ausente.

## 5. Movimento

Nada novo; tudo de `animation/motion.ts`.

| Momento                        | Token                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| Folha entrando / saindo        | `SlideInDown.springify().damping(20).stiffness(200)` / `SlideOutDown.duration(180)` |
| Scrim                          | `FadeIn.duration(160)` / `FadeOut.duration(140)`                  |
| Pilha de fichas aparecendo     | `FadeIn.duration(180)`                                            |
| Linha de membro entrando       | `FadeInDown.delay(index * STAGGER_MS).duration(280)`               |
| Copiar link (confirmação)      | `FADE` no rótulo + háptico leve                                    |
| Toque em qualquer controle     | `PressableScale` (usa `PRESS_SPRING`)                              |

## 6. Acessibilidade

- Pilha de fichas: um só rótulo (`sharedWith(n)`); fichas internas escondidas do
  leitor.
- Fichas de papel: `accessibilityRole="radio"` e `accessibilityState={{ selected }}`.
- Campo do link: `accessibilityRole="text"` com o link soletrável; o botão
  Copiar tem rótulo próprio ("Copiar link do projeto").
- Remover membro: rótulo inclui o nome — "Remover Rafa do projeto".
- `viewer`: além de desabilitar, marque `accessibilityState={{ disabled: true }}`
  nas caixas de tarefa, ou o leitor de tela anuncia um controle que não faz nada.
- Contraste no papel `#FFFBF0`: `mutedStrong` 7,1:1 · `danger` 4,9:1 ·
  Tinta sobre Sol 11,4:1. `muted` (3,8:1) só para linhas e trilhas, nunca para
  texto de 11–13px.

## 7. Ordem de trabalho na UI

| #   | Arquivo                            | Entrega verificável                                            |
| --- | ---------------------------------- | -------------------------------------------------------------- |
| 1   | `views/FieldGlyphs.tsx`            | `PeopleGlyph` e `LinkGlyph` renderizando em 16px.               |
| 2   | `views/MemberChip.tsx`             | Três tamanhos, `pending`, `stacked`.                            |
| 3   | `views/MemberStack.tsx`            | Cap de 3 com `+N` e rótulo único.                               |
| 4   | `screens/ListsScreen.tsx`          | Pilha na linha + item "Compartilhar" no menu.                   |
| 5   | `views/ShareSheet.tsx`             | Os seis estados do §3.4, com a casca do `ProjectEditorSheet`.    |
| 6   | `localization/taskCopy.ts`         | Strings nos dois idiomas.                                       |
| 7   | Estado `viewer` em toda a aba      | Caixas, FAB e folha coerentes.                                  |
| 8   | `views/SharedDayBand.tsx`          | Fase 2, só depois do resto em produção.                         |
