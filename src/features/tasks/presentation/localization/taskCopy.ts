export const appLanguages = ['pt-BR', 'en-US'] as const;

export type AppLanguage = (typeof appLanguages)[number];

export interface TaskCopy {
  tabs: { today: string; lists: string; you: string };
  today: {
    title: string;
    taskCount: (count: number) => string;
    sectionOverdue: string;
    sectionToday: string;
    sectionTomorrow: string;
    sectionNoDate: string;
    empty: string;
    emptyHint: string;
    capture: string;
    remove: string;
    removeConfirm: (title: string) => string;
    removeCancel: string;
    expand: string;
    collapse: string;
    edit: string;
    groupBy: string;
    grouping: {
      deadline: string;
      list: string;
      priority: string;
    };
    /** The "now" card: what to act on first, before the rest of the list. */
    agora: string;
    agoraMore: (count: number) => string;
    /** Starts the task from the now band, as opposed to `focus.start`, which
     * talks about the timer. */
    doNow: string;
    /** The label on the band's second control: closes the task outright. */
    markDone: string;
    /** How far past the deadline. `overdue` is an adjective and does not
     * conjugate with a number. */
    lateDays: (days: number) => string;
    /** The weight a finished task just paid out. The colour says the rest. */
    earned: (weight: number) => string;
    /** The band's only control names the task it acts on. */
    doNowOn: (title: string) => string;
    /** Nothing due today, but the list is not empty: distinct from having
     * never written anything down. */
    caughtUpTitle: string;
    caughtUpNext: (title: string) => string;
    caughtUpAllDone: string;
  };
  capture: {
    placeholder: string;
    /** Says what priority is for, next to where it is chosen. Teaching the
     * syntax first taught people to type punctuation without ever telling
     * them what it changed. */
    hint: string;
    /** Editing does not read the text, so it must not promise that it will. */
    editHint: string;
    /** The sheet opens minimal: these name the way into the chips and into the
     * writing shortcuts, one tap away each. */
    moreOptions: string;
    lessOptions: string;
    syntaxTitle: string;
    syntaxHelp: string;
    noList: string;
    datePanelTitle: string;
    spacePanelTitle: string;
    previousMonth: string;
    nextMonth: string;
    save: string;
    /** The primary while a task is still being written: it is added to the
     * day, not saved back into it. Editing keeps "save". */
    add: string;
    cancel: string;
    examples: readonly string[];
    priority: Record<'low' | 'medium' | 'high', string>;
    noDate: string;
    today: string;
    tomorrow: string;
    minutes: (value: number) => string;
    /** Saying something before the deadline, chosen on the task itself. Only
     * ever seen on a task that has a date to count back from. */
    reminder: {
      /** Names the control for a screen reader, whatever it currently says. */
      label: string;
      off: string;
      on: (days: number) => string;
      noReminder: string;
      daysBefore: (days: number) => string;
      /** What the chip itself says when the deadline leaves no room: short
       * enough for a chip, and the same fact as `tooLateHint`. */
      noLeadTime: string;
      /** A deadline today or already past leaves no room to warn early. */
      tooLateHint: string;
      /** The phone was told no. Says what is off, never what the person did
       * wrong. */
      blockedHint: string;
      openSettings: string;
      /** Under the lead-time options: when the phone speaks, and why some
       * days are missing. */
      panelHint: string;
    };
    /** What kind of item is being written: work to finish, or something to be
     * reminded of from time to time. */
    kind: {
      label: string;
      task: string;
      reminder: string;
      /** The third thing a space can hold. Creating a group is a sibling of
       * creating a task, not a menu tucked away somewhere. */
      group: string;
    };
    /** How often a reminder comes back, chosen on the reminder itself. */
    recurrence: {
      label: string;
      once: string;
      weekly: string;
      monthly: string;
      yearly: string;
    };
    /** When this reminder next speaks, shown while it is being written or
     * changed. */
    nextAlert: (date: string) => string;
    /** A reminder needs a date to come back on, said as a fact about the
     * reminder and never as something the person got wrong. */
    reminderNeedsDate: string;
  };
  /** Something to be remembered from time to time: a birthday, a bill. Never
   * work, so it is never open, never late and never worth points. */
  reminderItem: {
    /** Heading of the section the reminders live in. */
    sectionTitle: string;
    /** Said first by a screen reader, so the row is never mistaken for a task
     * whose box went missing. */
    a11yKind: string;
    /** What the row shows on the right: the next time it speaks. */
    next: (date: string) => string;
    /** For a one-off whose day has passed: it has nothing left to say. */
    noNext: string;
  };
  /** The steps inside one task. Only ever seen while editing a task: capture
   * stays one field. */
  subtasks: {
    title: string;
    /** Names one step for a screen reader, so its box is never mistaken for
     * the task's own. */
    item: (title: string) => string;
    /** Read out on a card that has steps, where only "2/5" is drawn. */
    progress: (done: number, total: number) => string;
    /** Read out while writing a new task, where nothing is ticked yet and only
     * the number of steps is drawn. */
    count: (total: number) => string;
    addPlaceholder: string;
    add: string;
    /** Names the step being renamed, so the field is not an unlabelled box. */
    rename: (title: string) => string;
    remove: (title: string) => string;
    /** A suggestion, never a verdict: finishing the steps is not finishing the
     * task, and the person is the one who says it is done. */
    allDone: string;
    limitReached: (limit: number) => string;
  };
  lists: {
    title: string;
    subtitle: (lists: number, tasks: number) => string;
    empty: string;
    progress: (done: number, total: number) => string;
    addToDay: string;
    inDay: string;
    newList: string;
    /** Sits under "Novo espaço": the templates are a shortcut, never a
     * requirement. */
    templatesSubtitle: string;
    /** Name and short description of each starting point. The name is what
     * lands in the name field when the card is tapped. */
    templates: Record<ProjectTemplateId, { name: string; description: string }>;
    renameList: string;
    create: string;
    namePlaceholder: string;
    nameHint: string;
    duplicateName: string;
    sharedProject: string;
    sharedProjectHint: string;
    /** The primary action once the space is set to be shared: creating it and
     * getting the invite are one step. */
    createAndInvite: string;
    /** The chip that reopens the starting points, named after the one the
     * sheet is resting on. */
    changeTemplate: (name: string) => string;
    /** The sheet right after a shared space is made: it stays open on the
     * invite instead of closing. */
    readyTitle: (name: string) => string;
    readySubtitle: string;
    inviteLinkLabel: string;
    /** What the link gives whoever opens it, and where that can be changed. */
    inviteLinkNote: (canEdit: boolean) => string;
    /** Leaving the invite for later undoes nothing, so it never says Cancel. */
    notNow: string;
    addFirstTask: string;
    addTask: string;
    rename: string;
    moreActions: (name: string) => string;
    /** The disclosure control on a project card, named by what the tap does
     * next: closed projects offer to open, open ones offer to close. */
    expandProject: (name: string) => string;
    collapseProject: (name: string) => string;
    delete: string;
    deleteConfirm: (name: string) => string;
    deleteDetail: string;
    color: string;
    icon: string;
    appearance: string;
    customize: string;
    back: string;
    done: string;
    colors: Record<ListColor, string>;
    icons: Record<ProjectIcon, string>;
    // Sharing a project with friends — see docs/design/ui-projeto-compartilhado.md.
    share: string;
    shareHint: string;
    createLink: string;
    copyLink: string;
    copyLinkAccessible: string;
    linkCopied: string;
    /**
     * What actually gets pasted into WhatsApp — by Copiar and by Convidar
     * alike. A bare link says nothing about which space it opens or what the
     * person will be able to do in it, and a link that fails to open (an old
     * WhatsApp, a link stripped by a corporate mail filter) leaves the other
     * side with nothing at all. So the message names the space, says what
     * joining gives, and carries the code on its own line for the "Entrar em
     * um espaço" field.
     */
    inviteMessage: (invite: {
      name: string;
      canEdit: boolean;
      link: string;
      token: string;
    }) => string;
    /** Shown while the server has not confirmed the share, so nobody sends a
     * link that will not open. */
    linkNotPublished: string;
    /** What a project card means when this account can only read it. */
    readOnlyTag: string;
    /** Names which project the open action row belongs to. */
    actionsFor: (name: string) => string;
    invite: string;
    invitedAsLabel: string;
    roleViewer: string;
    roleEditor: string;
    roleOwner: string;
    roleChangeNote: string;
    membersHeader: string;
    /** Who came into the project and when, most recent first. */
    joinHistoryHeader: string;
    /** Stands in for the moment of entry of somebody recorded before it was
     * kept: a dash, never a guessed date. */
    joinedAtUnknown: string;
    /** Says the section shows only the latest entries. */
    joinHistoryTruncated: (shown: number, total: number) => string;
    joinedAtAccessible: (name: string, when: string) => string;
    /** Spoken form of the dash: a screen reader never reads a bare glyph. */
    joinedAtUnknownAccessible: (name: string) => string;
    pendingInvite: string;
    /** The logged-in person's own row. */
    memberYou: string;
    memberYouInitials: string;
    /** For somebody a project only recorded by an address: the address is
     * never shown, so the row says this instead. */
    memberSomeone: string;
    removeMemberLabel: string;
    removeMember: (name: string) => string;
    removeMemberConfirm: (name: string) => string;
    stopSharing: string;
    stopSharingConfirm: string;
    sharedWith: (count: number) => string;
    /** Who took each task of a shared project. */
    assignSectionTitle: string;
    joinTask: string;
    leaveTask: string;
    assignedTo: (count: number) => string;
    /** What the tap does, never where the person already is: the row says
     * "put in" while nobody is on it, and "take out" once somebody is. */
    assignPerson: (name: string) => string;
    unassignPerson: (name: string) => string;
    assignedAnnouncement: (name: string) => string;
    unassignedAnnouncement: (name: string) => string;
    // The band at the top of an open shared project — fase 2.
    dayBandTitle: string;
    dayBandEmpty: string;
    dayBandEmptyHint: string;
    dayBandTakeOne: string;
    dayBandAllDone: (count: number) => string;
    dayBandStreak: (days: number) => string;
    dayBandOffline: string;
    dayBandError: string;
    dayBandRetry: string;
    dayBandRetrying: string;
    dayBandRetryFailed: string;
    dayBandAbsent: string;
    dayBandStateFocusing: string;
    dayBandStateOpen: string;
    dayBandStateDone: string;
    /** Under the closed line: who closed it and at what time. */
    dayBandClosedAt: (time: string) => string;
    /** The open space's own heading: who is in it and how much is open —
     * "Você e Júlia · 9 abertas". `others` never includes the person reading. */
    spaceSubtitle: (others: readonly string[], open: number) => string;
    /** The section of an open space that holds its tasks. */
    inSpaceSection: string;
    /** Spoken form of the line that leaves the open space. */
    backToSpaces: string;
    /** The index of spaces: the inbox card, the two sections and the facts
     * under each name. */
    indexSharedSection: string;
    indexOwnSection: string;
    indexSpaceCount: (count: number) => string;
    indexInboxFact: (open: number) => string;
    indexOpenCount: (open: number) => string;
    indexInFocus: (name: string) => string;
    indexPendingInvite: string;
    indexOverdue: (count: number) => string;
    indexAllClear: string;
    indexEmptyHint: string;
    joinInvite: string;
    joinInviteTitle: string;
    joinInviteHint: string;
    joinInvitePlaceholder: string;
    pasteFromClipboard: string;
    join: string;
    joining: string;
    invalidInvite: string;
    tryAgain: string;
    noNetwork: string;
    shareRefused: string;
    creatingLink: string;
    leaveProject: string;
    leaveProjectConfirm: (name: string) => string;
    deleteSharedDetail: string;
    completedBy: (name: string) => string;
    groupEmpty: string;
    groupEmptyInvite: string;
    groupAllDone: string;
    viewerCannotAdd: string;
    /**
     * Groups: a reason inside a space, with an identity of its own.
     *
     * A space holds two things now — loose tasks and groups — and the words
     * have to keep saying which is which without ever calling one of them a
     * kind of the other.
     */
    groups: {
      /** The count under the section heading: "2 grupos · 6 tarefas". */
      spaceContents: (groups: number, tasks: number) => string;
      groupCount: (count: number) => string;
      newGroup: string;
      newGroupIn: (space: string) => string;
      editGroup: string;
      create: string;
      save: string;
      namePlaceholder: string;
      duplicateName: string;
      iconLabel: string;
      /** Said out loud next to the label: the icon is a field, not an
       * ornament, and the primary action waits for it. */
      iconRequired: string;
      colorLabel: string;
      dateLabel: string;
      noDate: string;
      /** What choosing a date buys, said once under the two chips. */
      dateHint: string;
      /** The event, and how far away it still is. */
      eventToday: string;
      eventTomorrow: string;
      eventInDays: (days: number) => string;
      eventPastDays: (days: number) => string;
      /** How much of the group is finished. Never per person. */
      progress: (done: number, total: number) => string;
      progressShort: (done: number, total: number) => string;
      allDone: string;
      /** Spoken form of the block that opens the group. */
      open: (name: string) => string;
      /** The primary action inside a group names what it creates, so the `+`
       * never drops a task loose in the space by accident. */
      addTask: string;
      addFirstTask: string;
      empty: string;
      /** The sections inside an open group, by how close the event is. */
      sectionWeek: string;
      sectionDay: string;
      sectionLater: string;
      sectionOpen: string;
      sectionDone: string;
      delete: string;
      deleteConfirm: (name: string) => string;
      /** Said before the tap: the work is not what is being deleted. */
      deleteDetail: string;
      /** Spoken form of the line that leaves an open group. */
      backToSpace: (space: string) => string;
      /** The pill a group's task carries when it is seen from outside the
       * group — in the day, in Tarefas, in Foco. */
      pill: (name: string) => string;
    };
  };
  /** The rating prompt, asked once the app has closed a few tasks. */
  review: {
    title: string;
    body: string;
    thanks: string;
    feedbackThanks: string;
    later: string;
    never: string;
    /** Read out for each star, so the row is usable without seeing it. */
    starLabel: (stars: number) => string;
  };
  focus: {
    title: string;
    idle: string;
    idleEmpty: string;
    idleHint: string;
    /** Says which slice of the tasks is on this list, so a short list is not
     * read as a missing one. */
    idleScope: string;
    remaining: string;
    pause: string;
    resume: string;
    finish: string;
    complete: string;
    finished: string;
    chooseDuration: string;
    customDuration: string;
    increaseDuration: string;
    decreaseDuration: string;
    start: string;
    cancel: string;
    newFocus: string;
    /** Starts a block from the task itself, in the edit sheet. */
    action: string;
    /** Leaves the immersive session without stopping it. */
    close: string;
    rowPaused: string;
    rowDone: string;
    openSession: string;
  };
  progress: {
    /** Eyebrow of the day's card: the one yellow card on the tab. */
    today: string;
    /** The small "of 3" beside the big count. */
    todayOf: (total: number) => string;
    /** The day in one sentence, streak included. Neutral when nothing is
     * planned yet: an empty day is not a failure. */
    todaySentence: (done: number, total: number, streakDays: number) => string;
    /** Eyebrow of the seven-day chart. */
    sevenDays: string;
    /** Legend on the right of the chart: the weight closed over the week. */
    weekWeight: (weight: number) => string;
    weekSummary: (closed: number) => string;
    /** Level and streak together, in one quiet line under the name. */
    footnote: (level: number, streakDays: number) => string;
    weekdays: readonly string[];
  };
  settings: {
    title: string;
    appearance: string;
    dayCapacity: string;
    dayCapacityOption: (capacity: number) => string;
    dayCapacityHint: string;
    light: string;
    dark: string;
    language: string;
    /** The option that follows the phone, next to the languages by name. */
    languageSystem: string;
    about: string;
    version: (value: string) => string;
    replayOnboarding: string;
    replayOnboardingHint: string;
  };
  /** Notifications about what other people do in a shared project. */
  projectActivity: {
    settingsLabel: string;
    settingsToggle: string;
    settingsHint: string;
    /** What the section says while the switch is off: what it would do, not
     * what it is doing. */
    settingsHintOff: string;
    /** The switch is on, and the system is the one holding the alerts back. */
    blockedNote: string;
    blockedAction: string;
    promptBody: string;
    promptEnable: string;
    promptDismiss: string;
  };
  onboarding: {
    steps: readonly { title: string; body: string }[];
    next: string;
    skip: string;
    /** Announced on the scene, so the position in the walk-through is spoken
     * instead of being only a row of dots. */
    stepPosition: (step: number, total: number) => string;
    /** The last step asks for the one thing the app cannot do alone: somebody
     * else in the same space. Both answers close the walk-through, and the
     * note around them names the space by `demo.spaceName` — change the model
     * and that is the only string that moves. */
    invite: {
      noteLead: string;
      noteTail: string;
      action: string;
      later: string;
    };
    /** The fixed cast inside the cut-outs. Not chrome: these are the words a
     * reader sees inside the product shown on each step, so they are written
     * in the app's language like everything else. */
    demo: {
      spacesLabel: string;
      spaceName: string;
      spaceMeta: string;
      spacePill: string;
      combined: string;
      countSplit: string;
      today: string;
      focusPill: string;
      you: string;
      person2: string;
      taskCar: string;
      taskCarMeta: string;
      taskCrib: string;
      taskCribMeta: string;
      taskStay: string;
      taskStayMeta: string;
      taskFlights: string;
      taskPassport: string;
      taskPassportMeta: string;
      taskRoute: string;
      inviteBubble: string;
      inviteLink: string;
      inviteBubbleMeta: string;
      inviteJoinedTitle: string;
      inviteJoinedMeta: string;
    };
  };
  celebration: {
    title: string;
    body: (streak: number) => string;
    close: string;
  };
  priorityLabel: Record<'low' | 'medium' | 'high', string>;
  overdue: string;
  dueToday: string;
  tomorrow: string;
  noDate: string;
  stale: (days: number) => string;
}

const ptBR: TaskCopy = {
  tabs: { today: 'Tarefas', lists: 'Espaços', you: 'Você' },
  today: {
    title: 'Em aberto',
    taskCount: count => (count === 1 ? '1 tarefa' : `${count} tarefas`),
    sectionOverdue: 'Antes de hoje',
    sectionToday: 'Hoje',
    sectionTomorrow: 'Amanhã',
    sectionNoDate: 'Sem prazo',
    empty: 'Sua lista está livre.',
    emptyHint: 'O que você quer organizar primeiro?',
    capture: 'Nova tarefa',
    remove: 'Excluir',
    removeConfirm: title => `Excluir “${title}”? Isso não volta.`,
    removeCancel: 'Cancelar',
    expand: 'Expandir seção',
    collapse: 'Recolher seção',
    edit: 'Editar',
    groupBy: 'Organizar por',
    grouping: {
      deadline: 'Prazo',
      list: 'Espaço',
      priority: 'Prioridade',
    },
    agora: 'Agora',
    agoraMore: count => (count === 1 ? 'mais 1 hoje' : `mais ${count} hoje`),
    doNow: 'Começar agora',
    lateDays: days => (days === 1 ? '1 dia' : `${days} dias`),
    earned: weight => `+${weight}`,
    markDone: 'Concluir',
    doNowOn: title => `Começar agora: ${title}`,
    caughtUpTitle: 'Você está em dia.',
    caughtUpNext: title => `Próxima: ${title}`,
    caughtUpAllDone: 'Tudo certo por aqui.',
  },
  capture: {
    placeholder: 'O que precisa ser feito?',
    hint: 'Toque nas fichas para ajustar. Alta entra antes no dia e vale mais pontos.',
    editHint:
      'Aqui o texto vale como está escrito. Data, prioridade e lista mudam só nas fichas.',
    moreOptions: 'Mais opções',
    lessOptions: 'Menos opções',
    syntaxTitle: 'Atalhos de escrita',
    syntaxHelp:
      'Nada disso é obrigatório: as fichas fazem o mesmo com um toque.',
    noList: 'sem espaço',
    datePanelTitle: 'Data',
    spacePanelTitle: 'Espaço',
    previousMonth: 'Mês anterior',
    nextMonth: 'Próximo mês',
    save: 'Salvar',
    add: 'Adicionar',
    cancel: 'Cancelar',
    examples: [
      'ligar pro contador sexta 9h !alta #impostos',
      'comprar pão amanhã',
      'revisar roteiro ~45min',
    ],
    priority: {
      low: 'prioridade baixa',
      medium: 'prioridade média',
      high: 'prioridade alta',
    },
    noDate: 'sem data',
    today: 'hoje',
    tomorrow: 'amanhã',
    minutes: value =>
      value >= 60 ? `${Math.round(value / 60)} h` : `${value} min`,
    reminder: {
      label: 'Aviso antes do prazo',
      off: 'sem aviso',
      on: days =>
        days === 1 ? 'aviso 1 dia antes' : `aviso ${days} dias antes`,
      noReminder: 'Não avisar',
      // Impresso no chip: o substantivo fica, senão "2 dias" some no meio da
      // faixa entre "5/9" e "prioridade média" sem dizer do que se trata.
      daysBefore: days =>
        days === 1 ? 'Aviso · 1 dia' : `Aviso · ${days} dias`,
      noLeadTime: 'sem antecedência',
      tooLateHint: 'Sem antecedência possível para este prazo.',
      blockedHint: 'Notificações desativadas no sistema.',
      openSettings: 'Abrir ajustes',
      panelHint:
        'Sempre às 9:00 do dia escolhido. Com o prazo em cima, só as opções que ainda cabem aparecem.',
    },
    kind: {
      label: 'Tipo',
      task: 'Tarefa',
      reminder: 'Lembrete',
      group: 'Grupo',
    },
    recurrence: {
      label: 'Quando repetir',
      once: 'Uma vez',
      weekly: 'Toda semana',
      monthly: 'Todo mês',
      yearly: 'Todo ano',
    },
    nextAlert: date => `Próximo aviso: ${date}`,
    reminderNeedsDate: 'Um lembrete precisa de uma data.',
  },
  reminderItem: {
    sectionTitle: 'Lembretes',
    a11yKind: 'Lembrete',
    next: date => `avisa ${date}`,
    noNext: 'sem próximo aviso',
  },
  subtasks: {
    title: 'Subtarefas',
    item: title => `Subtarefa: ${title}`,
    progress: (done, total) => `${done} de ${total} subtarefas`,
    count: total => `${total} subtarefas`,
    addPlaceholder: 'Nova subtarefa',
    add: 'Adicionar subtarefa',
    rename: title => `Renomear subtarefa: ${title}`,
    remove: title => `Excluir subtarefa: ${title}`,
    allDone: 'Todas as subtarefas concluídas.',
    limitReached: limit => `Limite de ${limit} subtarefas por tarefa.`,
  },
  lists: {
    title: 'Seus espaços',
    subtitle: (lists, tasks) =>
      `${lists} ${lists === 1 ? 'espaço' : 'espaços'} · ${tasks} ${
        tasks === 1 ? 'aberta' : 'abertas'
      }`,
    empty: 'Nenhuma tarefa neste espaço.',
    progress: (done, total) => `${done}/${total}`,
    addToDay: 'Colocar no dia de hoje',
    inDay: 'No dia',
    newList: 'Novo espaço',
    templatesSubtitle: 'Comece de um destes ou do zero.',
    templates: {
      home: { name: 'Casa', description: 'Consertos e combinados' },
      trip: { name: 'Viagem', description: 'Reservas, malas, roteiro' },
      bills: { name: 'Contas', description: 'O que vence e quando' },
      market: { name: 'Mercado', description: 'A lista da semana' },
      work: { name: 'Trabalho', description: 'Entregas e responsáveis' },
      blank: { name: 'Do zero', description: 'Só o nome' },
    },
    renameList: 'Editar espaço',
    create: 'Criar',
    namePlaceholder: 'Nome do espaço',
    nameHint: 'Reúna os próximos passos de algo maior.',
    duplicateName: 'Esse espaço já existe. Escolha outro nome.',
    sharedProject: 'Espaço compartilhado',
    sharedProjectHint: 'Ao salvar, criamos o link de convite.',
    createAndInvite: 'Criar e convidar',
    changeTemplate: name => `Modelo: ${name} · trocar`,
    readyTitle: name => `${name} está pronto.`,
    readySubtitle: 'Convide alguém e comecem juntos.',
    inviteLinkLabel: 'Link do convite',
    inviteLinkNote: canEdit =>
      canEdit
        ? 'Quem abrir entra e pode editar. Dá para trocar depois, em Membros.'
        : 'Quem abrir entra e pode ver. Dá para trocar depois, em Membros.',
    notNow: 'Agora não',
    addFirstTask: 'Adicionar primeira tarefa',
    addTask: 'Adicionar tarefa',
    rename: 'Editar',
    moreActions: name => `Mais ações: ${name}`,
    expandProject: name => `Abrir espaço ${name}`,
    collapseProject: name => `Fechar espaço ${name}`,
    delete: 'Excluir',
    deleteConfirm: name => `Excluir “${name}”?`,
    deleteDetail: 'As tarefas serão movidas para Caixa; nada será apagado.',
    color: 'Cor',
    icon: 'Símbolo',
    appearance: 'Símbolo e cor',
    customize: 'Escolher',
    back: 'Voltar',
    done: 'Pronto',
    colors: {
      sun: 'Amarelo',
      grape: 'Roxo',
      mint: 'Verde',
      coral: 'Terracota',
      ocean: 'Azul-petróleo',
    },
    icons: {
      layers: 'Camadas',
      home: 'Casa',
      briefcase: 'Trabalho',
      plane: 'Viagem',
      book: 'Estudos',
      heart: 'Bem-estar',
      cart: 'Compras',
      wallet: 'Finanças',
      dumbbell: 'Treino',
      bulb: 'Ideias',
      calendar: 'Eventos',
      cake: 'Aniversário',
      gift: 'Presente',
      tools: 'Reforma',
      inbox: 'Caixa',
    },
    share: 'Compartilhar',
    shareHint:
      'Convide quem divide isso com você. Quem abrir o link entra no espaço.',
    createLink: 'Criar link',
    copyLink: 'Copiar',
    copyLinkAccessible: 'Copiar convite do espaço',
    linkCopied: 'Convite copiado',
    inviteMessage: ({ name, canEdit, link, token }) =>
      [
        `Te convidei para o espaço “${name}” no ${APP_NAME}.`,
        '',
        canEdit
          ? 'É onde a gente organiza as tarefas junto — você pode ver, marcar e criar tarefas.'
          : 'É onde a gente organiza as tarefas junto — você pode acompanhar tudo por lá.',
        '',
        'Toque para entrar:',
        link,
        '',
        `Código do espaço: ${token}`,
        'Se o link não abrir, cole esse código em “Entrar em um espaço”, no app.',
      ].join('\n'),
    linkNotPublished: 'Link ainda não publicado.',
    readOnlyTag: 'Somente leitura',
    actionsFor: name => `Ações de ${name}`,
    invite: 'Convidar',
    invitedAsLabel: 'Quem entrar pode',
    roleViewer: 'Ver',
    roleEditor: 'Editar',
    roleOwner: 'dono',
    roleChangeNote: 'Vale para quem entrar depois, não para quem já entrou.',
    membersHeader: 'No espaço',
    joinHistoryHeader: 'Entradas',
    joinedAtUnknown: '—',
    joinHistoryTruncated: (shown, total) =>
      `Mostrando as ${shown} entradas mais recentes de ${total}.`,
    joinedAtAccessible: (name, when) => `${name} entrou em ${when}`,
    joinedAtUnknownAccessible: name => `${name}, sem data de entrada`,
    pendingInvite: 'convite pendente',
    memberYou: 'Você',
    memberYouInitials: 'VC',
    memberSomeone: 'Pessoa do espaço',
    removeMemberLabel: 'Remover',
    removeMember: name => `Remover ${name} do espaço`,
    removeMemberConfirm: name => `Remover ${name} do espaço?`,
    stopSharing: 'Parar de compartilhar',
    stopSharingConfirm:
      'Ninguém mais vai poder entrar; quem já está sai também.',
    sharedWith: count => (count === 1 ? '1 pessoa' : `${count} pessoas`),
    assignSectionTitle: 'Pessoas',
    joinTask: 'Entrar na tarefa',
    leaveTask: 'Sair da tarefa',
    assignedTo: count =>
      count === 1 ? '1 pessoa na tarefa' : `${count} pessoas na tarefa`,
    assignPerson: name => `Colocar ${name} na tarefa`,
    unassignPerson: name => `Tirar ${name} da tarefa`,
    assignedAnnouncement: name => `${name} entrou na tarefa`,
    unassignedAnnouncement: name => `${name} saiu da tarefa`,
    dayBandTitle: 'O dia de vocês',
    dayBandEmpty: 'Ninguém escolheu tarefas para hoje ainda.',
    dayBandEmptyHint:
      'Cada um escolhe poucas tarefas para o dia. Aqui vocês veem o que cada um vai fazer.',
    dayBandTakeOne: 'Escolher uma tarefa para hoje',
    dayBandAllDone: count =>
      count === 1 ? 'Uma pessoa fechou hoje' : `Os ${count} fecharam hoje`,
    dayBandStreak: days =>
      days === 1 ? '1 dia seguido' : `${days} dias seguidos`,
    dayBandOffline:
      'Sem conexão agora — mostrando o que já estava no aparelho.',
    dayBandError: 'Não deu para carregar o dia de vocês.',
    dayBandRetry: 'Tentar de novo',
    dayBandRetrying: 'Tentando…',
    dayBandRetryFailed: 'Ainda não deu — tentar de novo',
    dayBandAbsent: 'Ainda não levou nada',
    dayBandStateFocusing: 'em foco',
    dayBandStateOpen: 'em aberto',
    dayBandStateDone: 'concluída',
    dayBandClosedAt: time => `fechou às ${time}`,
    spaceSubtitle: (others, open) => {
      const who =
        others.length === 0
          ? 'Só você'
          : others.length === 1
          ? `Você e ${others[0]}`
          : `Você, ${others.slice(0, -1).join(', ')} e ${
              others[others.length - 1]
            }`;

      return `${who} · ${open} ${open === 1 ? 'aberta' : 'abertas'}`;
    },
    inSpaceSection: 'No espaço',
    backToSpaces: 'Voltar para os espaços',
    indexSharedSection: 'Compartilhados',
    indexOwnSection: 'Só seus',
    indexSpaceCount: count => (count === 1 ? '1 espaço' : `${count} espaços`),
    indexInboxFact: open =>
      `Tarefas sem espaço · ${open} ${open === 1 ? 'aberta' : 'abertas'}`,
    indexOpenCount: open => `${open} ${open === 1 ? 'aberta' : 'abertas'}`,
    indexInFocus: name => `${name} em foco`,
    indexPendingInvite: 'convite pendente',
    indexOverdue: count => (count === 1 ? '1 atrasada' : `${count} atrasadas`),
    indexAllClear: 'Tudo em dia',
    indexEmptyHint:
      'Um espaço para cada combinado: a casa, a viagem, o churrasco.',
    joinInvite: 'Entrar com convite',
    joinInviteTitle: 'Entrar em um espaço',
    joinInviteHint: 'Cole o link que alguém te mandou.',
    joinInvitePlaceholder: 'Link do convite',
    pasteFromClipboard: 'Colar',
    join: 'Entrar',
    joining: 'Entrando…',
    invalidInvite: 'Esse convite não é válido. Confira o link e tente de novo.',
    tryAgain: 'Tentar de novo',
    noNetwork: 'Sem conexão agora. Verifique a internet e tente de novo.',
    shareRefused:
      'O servidor recusou este compartilhamento agora. Tente de novo em instantes.',
    creatingLink: 'Criando link…',
    leaveProject: 'Sair do espaço',
    leaveProjectConfirm: name =>
      `Sair de “${name}”? Você deixa de ver as tarefas dele.`,
    deleteSharedDetail:
      'Isso apaga o espaço para todo mundo, não só para você. Ninguém recupera as tarefas depois.',
    completedBy: name => `Concluída por ${name}`,
    groupEmpty: 'Um espaço vazio, pronto para o que vocês combinarem.',
    groupEmptyInvite: 'Convide alguém e comecem juntos.',
    groupAllDone: 'Tudo feito por aqui.',
    viewerCannotAdd: 'Você só pode ver este espaço.',
    groups: {
      spaceContents: (groups, tasks) =>
        `${groups} ${groups === 1 ? 'grupo' : 'grupos'} · ${tasks} ${
          tasks === 1 ? 'tarefa' : 'tarefas'
        }`,
      groupCount: count => `${count} ${count === 1 ? 'grupo' : 'grupos'}`,
      newGroup: 'Novo grupo',
      newGroupIn: space => `Novo grupo em ${space}`,
      editGroup: 'Editar grupo',
      create: 'Criar grupo',
      save: 'Salvar',
      namePlaceholder: 'Do que se trata?',
      duplicateName: 'Já existe um grupo com esse nome neste espaço.',
      iconLabel: 'Ícone',
      iconRequired: '· obrigatório',
      colorLabel: 'Cor',
      dateLabel: 'Data do evento',
      noDate: 'Sem data',
      dateHint:
        'Com data, o grupo avisa a semana do evento e organiza as tarefas por proximidade. Sem data, ele fica aberto, sem prazo.',
      eventToday: 'é hoje',
      eventTomorrow: 'é amanhã',
      eventInDays: days => `faltam ${days} dias`,
      eventPastDays: days => (days === 1 ? 'foi ontem' : `foi há ${days} dias`),
      progress: (done, total) => `${done} de ${total} feitas`,
      progressShort: (done, total) => `${done} de ${total}`,
      allDone: 'Tudo pronto',
      open: name => `Abrir ${name}`,
      addTask: 'Tarefa no grupo',
      addFirstTask: 'Primeira tarefa do grupo',
      empty: 'Nada aqui ainda. A primeira tarefa dá o começo.',
      sectionWeek: 'Esta semana',
      sectionDay: 'No dia',
      sectionLater: 'Depois',
      sectionOpen: 'Em aberto',
      sectionDone: 'Feitas',
      delete: 'Excluir grupo',
      deleteConfirm: name => `Excluir ${name}?`,
      deleteDetail: 'As tarefas continuam no espaço, soltas.',
      backToSpace: space => `Voltar para ${space}`,
      pill: name => `Grupo ${name}`,
    },
  },
  review: {
    title: 'Está te ajudando?',
    body: 'Sua nota é como outras pessoas encontram o app.',
    thanks: 'Obrigado! Vamos abrir a avaliação.',
    feedbackThanks: 'Obrigado por dizer. Vamos melhorar.',
    later: 'Agora não',
    never: 'Não perguntar de novo',
    starLabel: stars => (stars === 1 ? '1 estrela' : `${stars} estrelas`),
  },
  focus: {
    title: 'Foco',
    idle: 'Escolha uma para começar',
    idleEmpty: 'Nada aberto no dia. Feche o app e vá viver.',
    idleHint: 'Escolha o tempo que você acha que vai levar.',
    idleScope: 'Aqui ficam as tarefas do dia. Para outra, abra ela na lista.',
    remaining: 'restantes',
    pause: 'Pausar',
    resume: 'Retomar',
    finish: 'Encerrar',
    complete: 'Concluir',
    finished: 'Tempo cumprido.',
    chooseDuration: 'Quanto tempo você vai dar pra isso?',
    customDuration: 'Personalizado',
    increaseDuration: 'Aumentar tempo',
    decreaseDuration: 'Diminuir tempo',
    start: 'Começar',
    cancel: 'Cancelar',
    newFocus: 'Novo foco',
    action: 'Começar agora',
    close: 'Voltar',
    rowPaused: 'Pausado',
    rowDone: 'Tempo cumprido',
    openSession: 'Abrir sessão de foco',
  },
  progress: {
    today: 'Hoje',
    todayOf: total => `de ${total}`,
    todaySentence: (done, total, streakDays) => {
      const words = [
        'zero',
        'uma',
        'duas',
        'três',
        'quatro',
        'cinco',
        'seis',
        'sete',
        'oito',
        'nove',
        'dez',
      ];
      const word = (value: number) => words[value] ?? `${value}`;
      const streak =
        streakDays === 0
          ? ''
          : streakDays === 1
          ? ' 1 dia seguido.'
          : ` ${streakDays} dias seguidos.`;

      if (total === 0) return `Dia ainda em aberto.${streak}`;

      const head = word(done);

      return `${head.charAt(0).toUpperCase()}${head.slice(1)} de ${word(
        total,
      )}.${streak}`;
    },
    sevenDays: 'Semana',
    weekWeight: weight => `peso fechado · ${weight}`,
    weekSummary: closed =>
      closed === 1
        ? '1 tarefa fechada nos últimos 7 dias'
        : `${closed} tarefas fechadas nos últimos 7 dias`,
    footnote: (level, streakDays) =>
      streakDays === 0
        ? `Nível ${level}`
        : streakDays === 1
        ? `Nível ${level} · 1 dia seguido`
        : `Nível ${level} · ${streakDays} dias seguidos`,
    weekdays: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  },
  settings: {
    title: 'Ajustes',
    appearance: 'Aparência',
    dayCapacity: 'Tarefas por dia',
    dayCapacityOption: capacity => (capacity === 0 ? 'Todas' : `${capacity}`),
    dayCapacityHint:
      'Três é o padrão porque lista longa é o que faz alguém parar de abrir o app. Sem limite, tudo que estiver aberto aparece no dia.',
    light: 'Claro',
    dark: 'Escuro',
    language: 'Idioma',
    languageSystem: 'Sistema',
    about: 'Sobre',
    version: value => `Versão ${value}`,
    replayOnboarding: 'Ver a apresentação de novo',
    replayOnboardingHint:
      'Abre a apresentação inteira, do começo. Nada muda nas suas tarefas.',
  },
  projectActivity: {
    settingsLabel: 'Notificações do espaço',
    settingsToggle: 'Avisar sobre espaços compartilhados',
    settingsHint:
      'Avisa quando alguém do espaço conclui uma tarefa ou entra. Com o app fechado, o aviso pode levar alguns minutos.',
    settingsHintOff:
      'Ligado, avisa quando alguém do espaço conclui uma tarefa ou entra.',
    blockedNote: 'Avisos bloqueados nos ajustes do sistema',
    blockedAction: 'Abrir ajustes',
    promptBody:
      'Quer saber quando alguém do espaço concluir uma tarefa ou entrar?',
    promptEnable: 'Ativar avisos',
    promptDismiss: 'Agora não',
  },
  onboarding: {
    steps: [
      {
        title: 'Um espaço para a vida que vocês dividem.',
        body: 'A casa, a viagem, as contas — no mesmo dia, para os dois.',
      },
      {
        title: 'O dia de vocês, numa tela.',
        body: 'O que cada um levou, o que fechou, quem está em foco. Sem “e aquilo?”.',
      },
      {
        title: 'Quem divide a vida, divide o espaço.',
        body: 'Um link e a pessoa entra — sem cadastro antes, sem combinar nada. O espaço já nasce dos dois.',
      },
    ],
    next: 'Próximo',
    skip: 'Pular',
    stepPosition: (step, total) => `Passo ${step} de ${total}`,
    invite: {
      noteLead: 'Vamos criar o espaço',
      noteTail:
        'para você. Chame quem divide ele com você — um link, sem cadastro antes.',
      action: 'Convidar quem divide o espaço',
      later: 'Começar sozinho por enquanto',
    },
    demo: {
      spacesLabel: 'ESPAÇOS',
      spaceName: 'Casa',
      spaceMeta: 'Você e Júlia · 9 abertas',
      spacePill: 'Casa · Você e Júlia',
      combined: 'Hoje, no combinado',
      countSplit: '3 + 3',
      today: 'HOJE',
      focusPill: 'Léo está em foco · 18:40',
      you: 'Você',
      person2: 'Léo',
      taskCar: 'Levar o carro na revisão',
      taskCarMeta: 'Marcos · fechou às 9:12',
      taskCrib: 'Montar o berço',
      taskCribMeta: 'Júlia · em foco',
      taskStay: 'Reservar a pousada',
      taskStayMeta: 'Léo · fechou às 8:40',
      taskFlights: 'Comprar as passagens',
      taskPassport: 'Renovar o passaporte',
      taskPassportMeta: 'Você · fechou às 11:05',
      taskRoute: 'Fechar o roteiro dos três dias',
      inviteBubble: 'Entra no nosso espaço:',
      inviteLink: 'aluza.app/e/7k2xazjm',
      inviteBubbleMeta: 'enviado · 18:02',
      inviteJoinedTitle: 'Júlia entrou',
      inviteJoinedMeta: 'Casa · Você e Júlia · agora',
    },
  },
  celebration: {
    title: 'Dia fechado.',
    body: streak =>
      streak <= 1
        ? 'Três de três. Amanhã começa a sequência.'
        : `Três de três. ${streak} dias seguidos.`,
    close: 'Fechar',
  },
  priorityLabel: { low: 'baixa', medium: 'média', high: 'alta' },
  overdue: 'atrasada',
  dueToday: 'hoje',
  tomorrow: 'amanhã',
  noDate: 'sem data',
  stale: days => `parada há ${days} dias`,
};

const enUS: TaskCopy = {
  tabs: { today: 'Tasks', lists: 'Spaces', you: 'You' },
  today: {
    title: 'Open tasks',
    taskCount: count => (count === 1 ? '1 task' : `${count} tasks`),
    sectionOverdue: 'Before today',
    sectionToday: 'Today',
    sectionTomorrow: 'Tomorrow',
    sectionNoDate: 'No deadline',
    empty: 'Your list is clear.',
    emptyHint: 'What do you want to organize first?',
    capture: 'New task',
    remove: 'Delete',
    removeConfirm: title => `Delete “${title}”? This does not come back.`,
    removeCancel: 'Cancel',
    expand: 'Expand section',
    collapse: 'Collapse section',
    edit: 'Edit',
    groupBy: 'Group by',
    grouping: {
      deadline: 'Deadline',
      list: 'Space',
      priority: 'Priority',
    },
    agora: 'Now',
    agoraMore: count => (count === 1 ? '1 more today' : `${count} more today`),
    doNow: 'Start now',
    lateDays: days => (days === 1 ? '1 day' : `${days} days`),
    earned: weight => `+${weight}`,
    markDone: 'Mark done',
    doNowOn: title => `Start now: ${title}`,
    caughtUpTitle: "You're caught up.",
    caughtUpNext: title => `Next: ${title}`,
    caughtUpAllDone: 'All clear here.',
  },
  capture: {
    placeholder: 'What needs doing?',
    hint: 'Tap the chips to adjust. High goes into the day first and is worth more points.',
    editHint:
      'Here the text is kept as written. Date, priority and list change only through the chips.',
    moreOptions: 'More options',
    lessOptions: 'Fewer options',
    syntaxTitle: 'Writing shortcuts',
    syntaxHelp: 'None of this is required: the chips do the same with one tap.',
    noList: 'no space',
    datePanelTitle: 'Date',
    spacePanelTitle: 'Space',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    save: 'Save',
    add: 'Add',
    cancel: 'Cancel',
    examples: [
      'call the accountant friday 9h !high #taxes',
      'buy bread tomorrow',
      'review the script ~45min',
    ],
    priority: {
      low: 'low priority',
      medium: 'medium priority',
      high: 'high priority',
    },
    noDate: 'no date',
    today: 'today',
    tomorrow: 'tomorrow',
    minutes: value =>
      value >= 60 ? `${Math.round(value / 60)} h` : `${value} min`,
    reminder: {
      label: 'Reminder before the due date',
      off: 'no reminder',
      on: days =>
        days === 1 ? 'reminder 1 day before' : `reminder ${days} days before`,
      noReminder: 'No reminder',
      daysBefore: days =>
        days === 1 ? 'Reminder · 1 day' : `Reminder · ${days} days`,
      noLeadTime: 'no lead time',
      tooLateHint: 'No lead time available for this due date.',
      blockedHint: 'Notifications are turned off in the system.',
      openSettings: 'Open settings',
      panelHint:
        'Always at 9:00 on the chosen day. Close to the deadline, only the lead times that still fit are offered.',
    },
    kind: {
      label: 'Type',
      task: 'Task',
      reminder: 'Reminder',
      group: 'Group',
    },
    recurrence: {
      label: 'How often',
      once: 'Once',
      weekly: 'Every week',
      monthly: 'Every month',
      yearly: 'Every year',
    },
    nextAlert: date => `Next alert: ${date}`,
    reminderNeedsDate: 'A reminder needs a date.',
  },
  reminderItem: {
    sectionTitle: 'Reminders',
    a11yKind: 'Reminder',
    next: date => `alerts ${date}`,
    noNext: 'no next alert',
  },
  subtasks: {
    title: 'Subtasks',
    item: title => `Subtask: ${title}`,
    progress: (done, total) => `${done} of ${total} subtasks`,
    count: total => `${total} subtasks`,
    addPlaceholder: 'New subtask',
    add: 'Add subtask',
    rename: title => `Rename subtask: ${title}`,
    remove: title => `Delete subtask: ${title}`,
    allDone: 'All subtasks done.',
    limitReached: limit => `Limit of ${limit} subtasks per task.`,
  },
  lists: {
    title: 'Your spaces',
    subtitle: (lists, tasks) =>
      `${lists} ${lists === 1 ? 'space' : 'spaces'} · ${tasks} open`,
    empty: 'No tasks in this space.',
    progress: (done, total) => `${done}/${total}`,
    addToDay: 'Add to today',
    inDay: 'In the day',
    newList: 'New space',
    templatesSubtitle: 'Start from one of these, or from scratch.',
    templates: {
      home: { name: 'Home', description: 'Repairs and agreements' },
      trip: { name: 'Trip', description: 'Bookings, packing, itinerary' },
      bills: { name: 'Bills', description: 'What is due and when' },
      market: { name: 'Groceries', description: 'This week’s list' },
      work: { name: 'Work', description: 'Deliverables and owners' },
      blank: { name: 'From scratch', description: 'Just the name' },
    },
    renameList: 'Edit space',
    create: 'Create',
    namePlaceholder: 'Space name',
    nameHint: 'Gather the next steps of something larger.',
    duplicateName: 'That space already exists. Choose another name.',
    sharedProject: 'Shared space',
    sharedProjectHint: 'Saving creates the invite link.',
    createAndInvite: 'Create and invite',
    changeTemplate: name => `Template: ${name} · change`,
    readyTitle: name => `${name} is ready.`,
    readySubtitle: 'Invite someone and start together.',
    inviteLinkLabel: 'Invite link',
    inviteLinkNote: canEdit =>
      canEdit
        ? 'Whoever opens it joins and can edit. You can change that later, in Members.'
        : 'Whoever opens it joins and can view. You can change that later, in Members.',
    notNow: 'Not now',
    addFirstTask: 'Add first task',
    addTask: 'Add task',
    rename: 'Edit',
    moreActions: name => `More actions: ${name}`,
    expandProject: name => `Open space ${name}`,
    collapseProject: name => `Close space ${name}`,
    delete: 'Delete',
    deleteConfirm: name => `Delete “${name}”?`,
    deleteDetail: 'Its tasks will move to Inbox; nothing will be deleted.',
    color: 'Color',
    icon: 'Symbol',
    appearance: 'Symbol and color',
    customize: 'Choose',
    back: 'Back',
    done: 'Done',
    colors: {
      sun: 'Yellow',
      grape: 'Purple',
      mint: 'Green',
      coral: 'Terracotta',
      ocean: 'Teal',
    },
    icons: {
      layers: 'Layers',
      home: 'Home',
      briefcase: 'Work',
      plane: 'Travel',
      book: 'Study',
      heart: 'Well-being',
      cart: 'Shopping',
      wallet: 'Finances',
      dumbbell: 'Workout',
      bulb: 'Ideas',
      calendar: 'Events',
      cake: 'Birthday',
      gift: 'Gift',
      tools: 'Repairs',
      inbox: 'Inbox',
    },
    share: 'Share',
    shareHint:
      'Invite whoever shares this with you. Whoever opens the link joins the space.',
    createLink: 'Create link',
    copyLink: 'Copy',
    copyLinkAccessible: 'Copy the space invite',
    linkCopied: 'Invite copied',
    inviteMessage: ({ name, canEdit, link, token }) =>
      [
        `I invited you to the “${name}” space on ${APP_NAME}.`,
        '',
        canEdit
          ? "It's where we organise the tasks together — you can view, tick and add tasks."
          : "It's where we organise the tasks together — you can follow everything there.",
        '',
        'Tap to join:',
        link,
        '',
        `Space code: ${token}`,
        'If the link does not open, paste that code into “Join a space” in the app.',
      ].join('\n'),
    linkNotPublished: 'Link not published yet.',
    readOnlyTag: 'Read only',
    actionsFor: name => `${name} actions`,
    invite: 'Invite',
    invitedAsLabel: 'Whoever joins can',
    roleViewer: 'View',
    roleEditor: 'Edit',
    roleOwner: 'owner',
    roleChangeNote: 'Applies to whoever joins next, not to who is already in.',
    membersHeader: 'In the space',
    joinHistoryHeader: 'Joined',
    joinedAtUnknown: '—',
    joinHistoryTruncated: (shown, total) =>
      `Showing the ${shown} most recent of ${total}.`,
    joinedAtAccessible: (name, when) => `${name} joined on ${when}`,
    joinedAtUnknownAccessible: name => `${name}, no join date recorded`,
    pendingInvite: 'invite pending',
    memberYou: 'You',
    memberYouInitials: 'YO',
    memberSomeone: 'Someone in this space',
    removeMemberLabel: 'Remove',
    removeMember: name => `Remove ${name} from the space`,
    removeMemberConfirm: name => `Remove ${name} from the space?`,
    stopSharing: 'Stop sharing',
    stopSharingConfirm:
      'Nobody else can join; whoever is already in leaves too.',
    sharedWith: count => (count === 1 ? '1 person' : `${count} people`),
    assignSectionTitle: 'People',
    joinTask: 'Join this task',
    leaveTask: 'Leave this task',
    assignedTo: count =>
      count === 1 ? '1 person on this task' : `${count} people on this task`,
    assignPerson: name => `Put ${name} on this task`,
    unassignPerson: name => `Take ${name} off this task`,
    assignedAnnouncement: name => `${name} joined the task`,
    unassignedAnnouncement: name => `${name} left the task`,
    dayBandTitle: 'Your day together',
    dayBandEmpty: 'Nobody has picked tasks for today yet.',
    dayBandEmptyHint:
      'Each person picks a few tasks for the day. Here you see what everyone will do.',
    dayBandTakeOne: 'Pick a task for today',
    dayBandAllDone: count =>
      count === 1 ? 'One person closed today' : `All ${count} closed today`,
    dayBandStreak: days =>
      days === 1 ? '1 day in a row' : `${days} days in a row`,
    dayBandOffline:
      'No connection right now — showing what was already on the phone.',
    dayBandError: 'Could not load your day together.',
    dayBandRetry: 'Try again',
    dayBandRetrying: 'Trying…',
    dayBandRetryFailed: 'Still no luck — try again',
    dayBandAbsent: 'Has not taken anything yet',
    dayBandStateFocusing: 'in focus',
    dayBandStateOpen: 'open',
    dayBandStateDone: 'done',
    dayBandClosedAt: time => `closed at ${time}`,
    spaceSubtitle: (others, open) => {
      const who =
        others.length === 0
          ? 'Just you'
          : others.length === 1
          ? `You and ${others[0]}`
          : `You, ${others.slice(0, -1).join(', ')} and ${
              others[others.length - 1]
            }`;

      return `${who} · ${open} open`;
    },
    inSpaceSection: 'In the space',
    backToSpaces: 'Back to spaces',
    indexSharedSection: 'Shared',
    indexOwnSection: 'Just yours',
    indexSpaceCount: count => (count === 1 ? '1 space' : `${count} spaces`),
    indexInboxFact: open => `Tasks without a space · ${open} open`,
    indexOpenCount: open => `${open} open`,
    indexInFocus: name => `${name} in focus`,
    indexPendingInvite: 'invite pending',
    indexOverdue: count => (count === 1 ? '1 overdue' : `${count} overdue`),
    indexAllClear: 'All caught up',
    indexEmptyHint:
      'A space for every plan: the house, the trip, the barbecue.',
    joinInvite: 'Join with invite',
    joinInviteTitle: 'Join a space',
    joinInviteHint: 'Paste the link someone sent you.',
    joinInvitePlaceholder: 'Invite link',
    pasteFromClipboard: 'Paste',
    join: 'Join',
    joining: 'Joining…',
    invalidInvite: "That invite isn't valid. Check the link and try again.",
    tryAgain: 'Try again',
    noNetwork: 'No connection right now. Check the internet and try again.',
    shareRefused:
      'The server refused this share right now. Try again in a moment.',
    creatingLink: 'Creating link…',
    leaveProject: 'Leave space',
    leaveProjectConfirm: name => `Leave “${name}”? You stop seeing its tasks.`,
    deleteSharedDetail:
      'This deletes the space for everyone, not just you. Nobody gets the tasks back after.',
    completedBy: name => `Completed by ${name}`,
    groupEmpty: 'An empty space, ready for whatever you set up together.',
    groupEmptyInvite: 'Invite someone and start together.',
    groupAllDone: 'All done here.',
    viewerCannotAdd: 'You can only view this space.',
    groups: {
      spaceContents: (groups, tasks) =>
        `${groups} ${groups === 1 ? 'group' : 'groups'} · ${tasks} ${
          tasks === 1 ? 'task' : 'tasks'
        }`,
      groupCount: count => `${count} ${count === 1 ? 'group' : 'groups'}`,
      newGroup: 'New group',
      newGroupIn: space => `New group in ${space}`,
      editGroup: 'Edit group',
      create: 'Create group',
      save: 'Save',
      namePlaceholder: 'What is it about?',
      duplicateName: 'A group with this name already exists in this space.',
      iconLabel: 'Icon',
      iconRequired: '· required',
      colorLabel: 'Colour',
      dateLabel: 'Event date',
      noDate: 'No date',
      dateHint:
        'With a date, the group flags the week of the event and orders its tasks by how close it is. Without one, it stays open, with no deadline.',
      eventToday: 'is today',
      eventTomorrow: 'is tomorrow',
      eventInDays: days => `${days} days to go`,
      eventPastDays: days =>
        days === 1 ? 'was yesterday' : `was ${days} days ago`,
      progress: (done, total) => `${done} of ${total} done`,
      progressShort: (done, total) => `${done} of ${total}`,
      allDone: 'All done',
      open: name => `Open ${name}`,
      addTask: 'Task in this group',
      addFirstTask: 'First task of the group',
      empty: 'Nothing here yet. The first task starts it.',
      sectionWeek: 'This week',
      sectionDay: 'On the day',
      sectionLater: 'Later',
      sectionOpen: 'Open',
      sectionDone: 'Done',
      delete: 'Delete group',
      deleteConfirm: name => `Delete ${name}?`,
      deleteDetail: 'The tasks stay in the space, loose.',
      backToSpace: space => `Back to ${space}`,
      pill: name => `Group ${name}`,
    },
  },
  review: {
    title: 'Is this helping?',
    body: 'Your rating is how other people find the app.',
    thanks: 'Thank you. Opening the rating now.',
    feedbackThanks: 'Thank you for saying so. We will do better.',
    later: 'Not now',
    never: 'Do not ask again',
    starLabel: stars => (stars === 1 ? '1 star' : `${stars} stars`),
  },
  focus: {
    title: 'Focus',
    idle: 'Pick one to start',
    idleEmpty: 'Nothing open today. Close the app and go live.',
    idleHint: 'Pick how long you think it will take.',
    idleScope:
      "Today's tasks are listed here. For another one, open it in the list.",
    remaining: 'remaining',
    pause: 'Pause',
    resume: 'Resume',
    finish: 'Stop',
    complete: 'Complete',
    finished: 'Time served.',
    chooseDuration: 'How long are you giving this?',
    customDuration: 'Custom',
    increaseDuration: 'Increase time',
    decreaseDuration: 'Decrease time',
    start: 'Start',
    cancel: 'Cancel',
    newFocus: 'New focus',
    action: 'Start now',
    close: 'Back',
    rowPaused: 'Paused',
    rowDone: 'Time served',
    openSession: 'Open focus session',
  },
  progress: {
    today: 'Today',
    todayOf: total => `of ${total}`,
    todaySentence: (done, total, streakDays) => {
      const words = [
        'zero',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine',
        'ten',
      ];
      const word = (value: number) => words[value] ?? `${value}`;
      const streak =
        streakDays === 0
          ? ''
          : streakDays === 1
          ? ' 1 day in a row.'
          : ` ${streakDays} days in a row.`;

      if (total === 0) return `The day is still open.${streak}`;

      const head = word(done);

      return `${head.charAt(0).toUpperCase()}${head.slice(1)} of ${word(
        total,
      )}.${streak}`;
    },
    sevenDays: 'Week',
    weekWeight: weight => `weight closed · ${weight}`,
    weekSummary: closed =>
      closed === 1
        ? '1 task closed in the last 7 days'
        : `${closed} tasks closed in the last 7 days`,
    footnote: (level, streakDays) =>
      streakDays === 0
        ? `Level ${level}`
        : streakDays === 1
        ? `Level ${level} · 1 day in a row`
        : `Level ${level} · ${streakDays} days in a row`,
    weekdays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    dayCapacity: 'Tasks per day',
    dayCapacityOption: capacity => (capacity === 0 ? 'All' : `${capacity}`),
    dayCapacityHint:
      'Three is the default because a long list is what makes people stop opening the app. With no ceiling, everything still open shows up in the day.',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    languageSystem: 'System',
    about: 'About',
    version: value => `Version ${value}`,
    replayOnboarding: 'See the walk-through again',
    replayOnboardingHint:
      'Opens the whole walk-through, from the start. Nothing changes in your tasks.',
  },
  projectActivity: {
    settingsLabel: 'Space notifications',
    settingsToggle: 'Tell me about shared spaces',
    settingsHint:
      'Says when someone in the space completes a task or joins. With the app closed, the alert may take a few minutes.',
    settingsHintOff:
      'When on, it tells you when someone in the space completes a task or joins.',
    blockedNote: 'Alerts are off in system settings',
    blockedAction: 'Open settings',
    promptBody:
      'Want to hear when someone in the space completes a task or joins?',
    promptEnable: 'Turn on alerts',
    promptDismiss: 'Not now',
  },
  onboarding: {
    steps: [
      {
        title: 'A space for the life you share.',
        body: 'The house, the trip, the bills — on the same day, for both of you.',
      },
      {
        title: 'Your day, on one screen.',
        body: 'What each of you took on, what got closed, who is in focus. No more “and that other thing?”.',
      },
      {
        title: 'Whoever shares the life shares the space.',
        body: "One link and they're in — no sign-up first, nothing to set up. The space starts out as both of yours.",
      },
    ],
    next: 'Next',
    skip: 'Skip',
    stepPosition: (step, total) => `Step ${step} of ${total}`,
    invite: {
      noteLead: 'We’ll create the',
      noteTail:
        'space for you. Invite whoever shares it with you — a link, no sign-up first.',
      action: 'Invite whoever shares the space',
      later: 'Start on my own for now',
    },
    demo: {
      spacesLabel: 'SPACES',
      spaceName: 'Home',
      spaceMeta: 'You and Júlia · 9 open',
      spacePill: 'Home · You and Júlia',
      combined: 'Today, as agreed',
      countSplit: '3 + 3',
      today: 'TODAY',
      focusPill: 'Léo is in focus · 18:40',
      you: 'You',
      person2: 'Léo',
      taskCar: 'Take the car in for service',
      taskCarMeta: 'Marcos · closed at 9:12',
      taskCrib: 'Put the crib together',
      taskCribMeta: 'Júlia · in focus',
      taskStay: 'Book the guesthouse',
      taskStayMeta: 'Léo · closed at 8:40',
      taskFlights: 'Buy the tickets',
      taskPassport: 'Renew the passport',
      taskPassportMeta: 'You · closed at 11:05',
      taskRoute: 'Settle the three-day route',
      inviteBubble: 'Come into our space:',
      inviteLink: 'aluza.app/e/7k2xazjm',
      inviteBubbleMeta: 'sent · 6:02 pm',
      inviteJoinedTitle: 'Júlia joined',
      inviteJoinedMeta: 'Casa · You and Júlia · just now',
    },
  },
  celebration: {
    title: 'Day closed.',
    body: streak =>
      streak <= 1
        ? 'Three of three. Tomorrow starts the streak.'
        : `Three of three. ${streak} days in a row.`,
    close: 'Close',
  },
  priorityLabel: { low: 'low', medium: 'medium', high: 'high' },
  overdue: 'overdue',
  dueToday: 'today',
  tomorrow: 'tomorrow',
  noDate: 'no date',
  stale: days => `sitting for ${days} days`,
};

const COPY: Record<AppLanguage, TaskCopy> = { 'pt-BR': ptBR, 'en-US': enUS };

export function getTaskCopy(language: AppLanguage): TaskCopy {
  return COPY[language] ?? ptBR;
}
import { APP_NAME } from '../../../../app/config/appMetadata';
import type { ListColor, ProjectIcon } from '../../domain/TaskList';
import type { ProjectTemplateId } from '../models/projectTemplates';
