import {
  DEFAULT_PROJECT_ICON,
  type ListColor,
  type ProjectIcon,
} from '../../domain/TaskList';

/** The blank one comes first: making a space from nothing is the front door,
 * not the last card in the grid. */
export const projectTemplateIds = [
  'blank',
  'home',
  'trip',
  'bills',
  'market',
  'work',
] as const;

export type ProjectTemplateId = (typeof projectTemplateIds)[number];

export interface ProjectTemplateAppearance {
  /** Null is the blank card: it carries no symbol of its own, so the sheet
   * opens on the current default instead of a suggestion. */
  icon: ProjectIcon | null;
  color: ListColor;
}

/** Symbol and colour a template starts from. The words live in the copy file,
 * so a template reads in the language the phone is in. */
export const projectTemplates: Record<
  ProjectTemplateId,
  ProjectTemplateAppearance
> = {
  home: { icon: 'home', color: 'coral' },
  trip: { icon: 'plane', color: 'ocean' },
  bills: { icon: 'wallet', color: 'sun' },
  market: { icon: 'cart', color: 'mint' },
  work: { icon: 'briefcase', color: 'ocean' },
  blank: { icon: null, color: 'sun' },
};

/** What the editor is pre-filled with. A blank space keeps the behaviour it
 * always had: empty name and the default symbol. */
export function templateAppearance(id: ProjectTemplateId): {
  icon: ProjectIcon;
  color: ListColor;
} {
  const template = projectTemplates[id];

  return {
    icon: template.icon ?? DEFAULT_PROJECT_ICON,
    color: template.color,
  };
}
