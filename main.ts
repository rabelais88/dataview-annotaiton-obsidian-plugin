import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  FrontMatterCache,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';

// Remember to rename these classes and interfaces!
// --- settings

interface MyPluginSettings {
  mySetting: string;
  triggerPhrase: string;
  separator: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
  triggerPhrase: ';;',
  separator: '.',
};

interface Annotation {
  name: string;
  type: 'item' | 'value';
  defaultContent?: 'today';
}
interface FrontMatterOptions extends FrontMatterCache {
  dataviewAnnotation: boolean;
  annotations: Annotation[];
}

// --- suggestions
interface IListCompletion {
  label: string;
  type?: Annotation['type'];
  value?: string;
}
export class ItemSuggest extends EditorSuggest<IListCompletion> {
  private app: App;
  private plugin: MyPlugin;
  constructor(app: App, plugin: MyPlugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
  }
  getSuggestions(ctx: EditorSuggestContext): IListCompletion[] {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return [{ label: 'no value has been suggested' }];
    return this.plugin.getList(ctx);
  }

  selectSuggestion(
    suggestion: IListCompletion,
    event: KeyboardEvent | MouseEvent
  ): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      return;
    }

    // const includeAlias = event.shiftKey;
    // let dateStr = '';
    // let makeIntoLink = this.plugin.settings.autosuggestToggleLink;

    // if (suggestion.label.startsWith('time:')) {
    //   const timePart = suggestion.label.substring(5);
    //   dateStr = this.plugin.parseTime(timePart).formattedString;
    //   makeIntoLink = false;
    // } else {
    //   dateStr = this.plugin.parseDate(suggestion.label).formattedString;
    // }

    // if (makeIntoLink) {
    //   dateStr = generateMarkdownLink(
    //     this.app,
    //     dateStr,
    //     includeAlias ? suggestion.label : undefined
    //   );
    // }
    const resultStr = this.plugin.parseListItem(suggestion);

    activeView.editor.replaceRange(
      resultStr,
      // @ts-ignore
      this.context.start,
      // @ts-ignore
      this.context.end
    );
  }

  renderSuggestion(suggestion: IListCompletion, el: HTMLElement): void {
    el.setText(suggestion.label);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile
  ): EditorSuggestTriggerInfo | null {
    // if (!this.plugin.settings.isAutosuggestEnabled) {
    //   return null;
    // // }

    // const triggerPhrase = this.plugin.settings.autocompleteTriggerPhrase;
    const triggerPhrase = this.plugin.settings.triggerPhrase;
    const startPos = this.context?.start || {
      line: cursor.line,
      ch: cursor.ch - triggerPhrase.length,
    };

    if (!editor.getRange(startPos, cursor).startsWith(triggerPhrase)) {
      return null;
    }

    // const precedingChar = editor.getRange(
    //   {
    //     line: startPos.line,
    //     ch: startPos.ch - 1,
    //   },
    //   startPos
    // );

    // Short-circuit if `@` as a part of a word (e.g. part of an email address)
    // if (precedingChar && /[`a-zA-Z0-9]/.test(precedingChar)) {
    //   return null;
    // }

    return {
      start: startPos,
      end: cursor,
      query: editor.getRange(startPos, cursor).substring(triggerPhrase.length),
    };
  }
}

export const addContentAtLine = async (
  app: App,
  line: number
): Promise<void> => {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView) {
    const file = activeView.file;
    let content = await app.vault.read(file);
    content = [line, content].join('');
    await app.vault.modify(file, content);
  }
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  getElements(el: HTMLElement, query: string) {
    const elements = el.querySelectorAll(query);
    if (elements?.length >= 1) return Array.from(elements);
    return [];
  }
  parseListItem(suggestion: IListCompletion) {
    // parsing suggestion after choose
    return suggestion.value ?? '';
  }
  get frontMatterOptions() {
    // get frontmatter data from outside scope
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    const cache = this.app.metadataCache.getCache(activeView.file.path);
    const frontmatter = cache?.frontmatter as FrontMatterOptions;
    return frontmatter as FrontMatterOptions;
  }
  get annotations() {
    return this.frontMatterOptions?.annotations ?? [];
  }
  get autocompleteEnabled() {
    return this.frontMatterOptions?.dataviewAnnotation ?? false;
  }
  getList(ctx: EditorSuggestContext): IListCompletion[] {
    if (!this.annotations || !this.autocompleteEnabled) return [];

    let filteredValues = this.annotations.filter((v) => {
      if (!this.settings.separator) {
        return v.name.includes(ctx.query);
      }
      // exclude texts beyond separator
      const q = ctx.query.split(this.settings.separator);
      return v.name.includes(q[0] ?? '');
    });

    if (filteredValues.length === 0) filteredValues = this.annotations;
    //   if (suggestion.type === 'item')
    //   return `- ${suggestion.label}::${suggestion.value}`;
    // return `[${suggestion.label}::${suggestion.value}]`;

    const valuesWithDefault: (Annotation & { content?: string })[] =
      filteredValues;
    filteredValues.forEach((filter) => {
      if (!filter.defaultContent) return;
      valuesWithDefault.push({ ...filter, content: filter.defaultContent });
    });

    return valuesWithDefault.map((v) => {
      let content = ctx.query;
      if (this.settings.separator) {
        content = ctx.query.split(this.settings.separator)?.[1] ?? '';
      }
      if (v.content === 'today') {
        content = window.moment().format('YYYY-MM-DD');
      }
      const value =
        v.type === 'item'
          ? `- ${v.name}::${content}`
          : `[${v.name}::${content}]`;
      return {
        label: value,
        value,
        type: v.type,
      };
    });
  }
  async onload() {
    await this.loadSettings();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SampleSettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    //   console.log('click', evt);
    // });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    this.registerInterval(
      window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000)
    );

    this.registerEditorSuggest(new ItemSuggest(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', {
      text: 'Autocomplete for Dataview Data Annotation',
    });

    new Setting(containerEl)
      .setName('trigger phrase')
      .setDesc('for autocompletion')
      .addText((text) =>
        text
          .setPlaceholder('trigger phrase i.e. ;;')
          .setValue(this.plugin.settings.triggerPhrase)
          .onChange(async (value) => {
            this.plugin.settings.triggerPhrase = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName('separator letter')
      .setDesc('separates value from key text when autocompleting')
      .addText((text) =>
        text
          .setPlaceholder('separator i.e. .')
          .setValue(this.plugin.settings.separator)
          .onChange(async (value) => {
            this.plugin.settings.separator = value;
            await this.plugin.saveSettings();
          })
      );

    const c = containerEl.createEl('code');
    const p = c.createEl('pre', {
      text: `
# sample frontmatter
dataviewAnnotation: true
annotations:
  - name: sampleValue
    type: item
  - name: sampleValue2
    type: value
  - name: sampleValue with default today value
    type: value
    defaultContent: 'today'
`,
    });
  }
}
